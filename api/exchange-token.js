import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED_ORIGINS = [
    'https://recapped-music.vercel.app',
    'http://127.0.0.1:3000',
];

const CLIENT_ID = process.env.VITE_CLIENT_ID;
const REDIRECT_URI = process.env.VITE_REDIRECT_URI || 'http://127.0.0.1:3000/';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const isProd = process.env.VERCEL_ENV === 'production';

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { code, verifier } = req.body || {};

    if (!code || !verifier) {
        return res.status(400).json({ error: 'Missing code or verifier' });
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: verifier,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            return res.status(500).json({ error: 'Token exchange failed', details: text });
        }

        const data = await response.json();
        const sessionId = crypto.randomUUID();
        const expiresAt = Date.now() + data.expires_in * 1000;

        await redis.set(`session:${sessionId}`, JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expiresAt,
        }), { ex: SESSION_TTL_SECONDS });

        res.setHeader('Set-Cookie', [
            `session_id=${sessionId}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${isProd ? '; Secure' : ''}`
        ]);

        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('exchange-token error:', err);
        res.status(500).json({ error: err.message });
    }
}