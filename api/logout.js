import { redis, isProd, isAllowedOrigin, getCookie } from '../lib/shared.js';

export default async function handler(req, res) {
    if (!isAllowedOrigin(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sessionId = getCookie(req, 'session_id');

    if (sessionId) {
        await redis.del(`session:${sessionId}`);
    }

    res.setHeader('Set-Cookie', [
        `session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProd ? '; Secure' : ''}`
    ]);

    res.status(200).json({ ok: true });
}