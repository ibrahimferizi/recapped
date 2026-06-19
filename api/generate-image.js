import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED_ORIGINS = [
    'recapped-music.vercel.app',
    'http://127.0.0.1:3000',
];

const MAX_PROMPT_LENGTH = 1000;
const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const key = `rate:image:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    if (count > RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const { prompt } = req.query;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Missing prompt' });
    }

    if (prompt.trim().length === 0) {
        return res.status(400).json({ error: 'Prompt is empty' });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} chars)` });
    }

    const sanitized = prompt.trim();

    console.log('prompt received:', sanitized.slice(0, 50));
    console.log('key exists:', !!process.env.POLLINATIONS_KEY);

    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(sanitized)}?model=flux&width=1080&height=1920&nologo=true&key=${process.env.POLLINATIONS_KEY}`;

    console.log('calling pollinations...');

    try {
        const response = await fetch(url);
        console.log('pollinations status:', response.status);

        if (!response.ok) {
            const text = await response.text();
            console.log('pollinations error:', text);
            return res.status(500).json({ error: 'Image generation failed', details: text });
        }

        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('fetch error:', err);
        res.status(500).json({ error: err.message });
    }
}