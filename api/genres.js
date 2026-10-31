import { isAllowedOrigin, clientIp, isRateLimited } from '../lib/shared.js';

const MAX_ARTIST_LENGTH = 200;
const RATE_LIMIT = 60;
const WINDOW_SECONDS = 60;

export default async function handler(req, res) {
    if (!isAllowedOrigin(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (await isRateLimited(`rate:genres:${clientIp(req)}`, RATE_LIMIT, WINDOW_SECONDS)) {
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
        res.status(500).json({ error: 'Internal error' });
    }
}