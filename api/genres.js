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

const MAX_ARTIST_LENGTH = 200;
const RATE_LIMIT = 60;
const WINDOW_SECONDS = 60;

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const key = `rate:genres:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    if (count > RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const { artist } = req.query;

    if (!artist || typeof artist !== 'string') {
        return res.status(400).json({ error: 'Missing artist' });
    }

    if (artist.trim().length === 0) {
        return res.status(400).json({ error: 'Artist is empty' });
    }

    if (artist.length > MAX_ARTIST_LENGTH) {
        return res.status(400).json({ error: `Artist name too long (max ${MAX_ARTIST_LENGTH} chars)` });
    }

    try {
        const response = await fetch(
            `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist.trim())}&api_key=${process.env.LASTFM_KEY}&format=json`
        );

        if (!response.ok) {
            return res.status(500).json({ error: 'Last.fm request failed' });
        }

        const data = await response.json();
        const genres = data.artist?.tags?.tag?.map(t => t.name) || [];
        res.status(200).json({ genres });
    } catch (err) {
        console.error('genres error:', err);
        res.status(500).json({ error: err.message });
    }
}