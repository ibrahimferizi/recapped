import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED_ORIGINS = [
    'https://recapped-app.vercel.app',
    'http://127.0.0.1:3000',
];

const CLIENT_ID = process.env.VITE_CLIENT_ID;

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { session_id } = req.body || {};

    if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: 'Missing session_id' });
    }

    const rateKey = `rate:refresh:${session_id}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
    if (count > 20) {
        return res.status(429).json({ error: 'Too many refresh attempts' });
    }

    try {
        const raw = await redis.get(`session:${session_id}`);

        if (!raw) {
            return res.status(401).json({ error: 'Session not found or expired' });
        }

        const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const { refresh_token } = session;

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: 'refresh_token',
                refresh_token,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            return res.status(401).json({ error: 'Refresh failed', details: text });
        }

        const data = await response.json();

        if (data.refresh_token) {
            await redis.set(`session:${session_id}`, JSON.stringify({ refresh_token: data.refresh_token }), {
                keepTtl: true,
            });
        }

        res.status(200).json({
            access_token: data.access_token,
            expires_in: data.expires_in,
        });
    } catch (err) {
        console.error('refresh error:', err);
        res.status(500).json({ error: err.message });
    }
}