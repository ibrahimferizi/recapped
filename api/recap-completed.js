import { Redis } from '@upstash/redis';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECORD_COMPLETION = `
if redis.call('EXISTS', KEYS[1]) == 0 then
    return {-1, 0}
end
if redis.call('EXISTS', KEYS[2]) == 1 then
    return {0, 0}
end
local total = redis.call('HINCRBY', KEYS[3], ARGV[1], 1)
redis.call('SET', KEYS[2], '1', 'EX', 604800)
return {1, total}
`;

export function createHandler({ redis, log = console.log, now = Date.now, environment = process.env.VERCEL_ENV }) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (environment !== 'production') {
            return res.status(204).end();
        }

        if (req.headers.origin !== 'https://recapped-music.vercel.app') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const sessionId = (req.headers.cookie || '').split(';')
            .map(cookie => cookie.trim())
            .find(cookie => cookie.startsWith('session_id='))?.slice(11);

        if (!UUID.test(sessionId || '')) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const { recapId, completedAt } = req.body || {};
        const completedTime = typeof completedAt === 'string' ? Date.parse(completedAt) : NaN;
        const age = now() - completedTime;

        if (typeof recapId !== 'string' || !UUID.test(recapId) || !Number.isFinite(completedTime) || age < -300000 || age > MAX_AGE_MS) {
            return res.status(400).json({ error: 'Invalid completion' });
        }

        const day = new Date(completedTime).toISOString().slice(0, 10);

        try {
            const [recorded, dailyTotal] = await redis.eval(RECORD_COMPLETION, [
                `session:${sessionId}`,
                `recapped:analytics:completed:${recapId.toLowerCase()}`,
                'recapped:analytics:daily',
            ], [day]);

            if (recorded === -1) {
                return res.status(401).json({ error: 'Session expired' });
            }

            if (recorded === 1) {
                log(JSON.stringify({ event: 'recap_generated', version: 1, day, daily_total: dailyTotal }));
            }

            return res.status(recorded === 1 ? 201 : 200).json({ ok: true });
        } catch {
            return res.status(503).json({ error: 'Completion tracking unavailable' });
        }
    };
}

let handler;

export default function recapCompleted(req, res) {
    handler ??= createHandler({ redis: Redis.fromEnv() });
    return handler(req, res);
}
