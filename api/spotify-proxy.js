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

const CLIENT_ID = process.env.VITE_CLIENT_ID;
const SPOTIFY_BASE = 'https://api.spotify.com/v1';

const ALLOWED_ENDPOINTS = {
    'me': () => '/me',
    'top-artists': (params) => `/me/top/artists?limit=50&time_range=${params.time_range}`,
    'top-tracks': (params) => `/me/top/tracks?limit=50&time_range=${params.time_range}`,
};

const VALID_TIME_RANGES = ['short_term', 'medium_term', 'long_term'];

function parseCookies(cookieHeader = '') {
    return Object.fromEntries(
        cookieHeader.split(';').filter(Boolean).map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
        })
    );
}

async function refreshTokens(sessionId, refresh_token) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token,
        }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const expiresAt = Date.now() + data.expires_in * 1000;
    const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires_at: expiresAt,
    };

    await redis.set(`session:${sessionId}`, JSON.stringify(updated), { keepTtl: true });
    return updated;
}

export default async function handler(req, res) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const ipRateKey = `rate:proxy-ip:${ip}`;
    const ipCount = await redis.incr(ipRateKey);
    if (ipCount === 1) await redis.expire(ipRateKey, 60);
    if (ipCount > 30) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.session_id;

    if (!sessionId) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const rateKey = `rate:proxy:${sessionId}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
    if (count > 60) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const { endpoint, time_range } = req.query;

    if (!endpoint || !ALLOWED_ENDPOINTS[endpoint]) {
        return res.status(400).json({ error: 'Invalid endpoint' });
    }

    if ((endpoint === 'top-artists' || endpoint === 'top-tracks')) {
        if (!time_range || !VALID_TIME_RANGES.includes(time_range)) {
            return res.status(400).json({ error: 'Invalid time_range' });
        }
    }

    try {
        const raw = await redis.get(`session:${sessionId}`);
        if (!raw) {
            return res.status(401).json({ error: 'Session not found or expired' });
        }

        let session = typeof raw === 'string' ? JSON.parse(raw) : raw;

        if (Date.now() > session.expires_at - 30000) {
            const refreshed = await refreshTokens(sessionId, session.refresh_token);
            if (!refreshed) {
                return res.status(401).json({ error: 'Session expired, please reconnect' });
            }
            session = refreshed;
        }

        const path = ALLOWED_ENDPOINTS[endpoint]({ time_range });
        const spotifyResponse = await fetch(`${SPOTIFY_BASE}${path}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (!spotifyResponse.ok) {
            const text = await spotifyResponse.text();
            return res.status(spotifyResponse.status).json({ error: 'Spotify API error', details: text });
        }

        const data = await spotifyResponse.json();
        res.status(200).json(data);
    } catch (err) {
        console.error('spotify-proxy error:', err);
        res.status(500).json({ error: err.message });
    }
}