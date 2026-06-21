import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED_ORIGINS = [
    'https://recapped-music.vercel.app',
    'http://127.0.0.1:3000',
];

const isProd = process.env.VERCEL_ENV === 'production';

function parseCookies(cookieHeader = '') {
    return Object.fromEntries(
        cookieHeader.split(';').filter(Boolean).map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
        })
    );
}

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.session_id;

    if (sessionId) {
        await redis.del(`session:${sessionId}`);
    }

    res.setHeader('Set-Cookie', [
        `session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProd ? '; Secure' : ''}`
    ]);

    res.status(200).json({ ok: true });
}