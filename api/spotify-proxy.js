import { redis, isAllowedOrigin, clientIp, getCookie, isRateLimited } from '../lib/shared.js';

const CLIENT_ID = process.env.VITE_CLIENT_ID;
const SPOTIFY_BASE = 'https://api.spotify.com/v1';

const ALLOWED_ENDPOINTS = {
    'me': () => '/me',
    'top-artists': (params) => `/me/top/artists?limit=50&time_range=${params.time_range}`,
    'top-tracks': (params) => `/me/top/tracks?limit=50&time_range=${params.time_range}`,
};

const VALID_TIME_RANGES = ['short_term', 'medium_term', 'long_term'];

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
    if (!isAllowedOrigin(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (await isRateLimited(`rate:proxy-ip:${clientIp(req)}`, 30, 60)) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const sessionId = getCookie(req, 'session_id');

    if (!sessionId) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    if (await isRateLimited(`rate:proxy:${sessionId}`, 60, 60)) {
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
            console.error('spotify api error:', spotifyResponse.status, text);
            return res.status(spotifyResponse.status).json({ error: 'Spotify API error' });
        }

        const data = await spotifyResponse.json();
        res.status(200).json(data);
    } catch (err) {
        console.error('spotify-proxy error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
}