import { redis, isAllowedOrigin, clientIp, getCookie, isRateLimited } from '../lib/shared.js';

const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;
const HEX = /^[0-9a-f]{6}$/i;
const MAX_GENRE_LENGTH = 50;

const DEFAULT_GEOMETRY = 'modular composition, layered geometry, rhythmic patterns';

const GENRE_GEOMETRY = {
    'hip-hop': 'bold asymmetry, oversized blocks, layered frames, sharp angles',
    'rap': 'bold asymmetry, oversized blocks, layered frames, sharp angles',
    'pop': 'playful geometry, bright rhythm, rounded forms',
    'indie': 'experimental layouts, collage-like structure, asymmetry',
    'electronic': 'repeating patterns, digital architecture, geometric motion',
    'rock': 'angular structures, diagonal tension, strong contrast',
    'metal': 'dense geometry, dramatic contrast, heavy visual weight',
    'classical': 'balanced symmetry, elegant structure, refined geometry',
    'jazz': 'flowing curves, rhythmic repetition, expressive structure'
};

const VARIANTS = [
    {
        picks: [0, 1, 2],
        structure: 'repeating modular forms, offset frames, geometric rhythm',
        mood: 'dark dominant composition, strong contrast, concentrated highlights'
    },
    {
        picks: [2, 3, 1],
        structure: 'warped geometric ribbons, layered structures, dynamic movement',
        mood: 'bright open composition, lighter overall appearance, airy negative space'
    },
    {
        picks: [4, 1, 0],
        structure: 'optical patterns, stacked blocks, structured visual hierarchy',
        mood: 'bold color-driven composition, high energy, large color fields'
    }
];

function buildPrompt(colors, genre, variantIndex) {
    const palette = [...new Set(colors)];

    while (palette.length < 5) {
        palette.push(palette[palette.length - 1]);
    }

    const variant = VARIANTS[variantIndex];
    const genreKey = genre.toLowerCase();
    const geometry = Object.hasOwn(GENRE_GEOMETRY, genreKey) ? GENRE_GEOMETRY[genreKey] : DEFAULT_GEOMETRY;
    const dominant = variant.picks.map(i => palette[i]).join(', ');

    return `premium abstract visual identity artwork, vertical mobile poster, dominant palette ${dominant}, pure abstract geometric design, non-representational, ${geometry}, ${variant.structure}, ${variant.mood}, modular graphic system, stacked geometric layers, cropped oversized forms, framing devices, rhythmic composition, bold negative space, high contrast, clean focal area in upper center, visual complexity around edges, lower section suitable for statistics overlay, modern branding artwork, graphic poster design, contemporary visual identity, generative design system, 2d graphic design, minimal depth, no humans, no people, no portraits, no faces, no eyes, no bodies, no silhouettes, no clothing, no musicians, no performers, no photography, no album covers, no typography, no text, no logos, no icons`;
}

export default async function handler(req, res) {
    if (!isAllowedOrigin(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (await isRateLimited(`rate:image:${clientIp(req)}`, RATE_LIMIT, WINDOW_SECONDS)) {
        return res.status(429).json({ error: 'Too many requests, slow down' });
    }

    const sessionId = getCookie(req, 'session_id');

    if (!sessionId || !(await redis.exists(`session:${sessionId}`))) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const { colors, genre, variant } = req.query;

    if (typeof colors !== 'string' || typeof genre !== 'string' || typeof variant !== 'string') {
        return res.status(400).json({ error: 'Invalid request' });
    }

    const colorList = colors.split(',').map(c => c.trim().toLowerCase());

    if (colorList.length < 1 || colorList.length > 5 || !colorList.every(c => HEX.test(c))) {
        return res.status(400).json({ error: 'Invalid colors' });
    }

    if (genre.length > MAX_GENRE_LENGTH) {
        return res.status(400).json({ error: 'Invalid genre' });
    }

    if (!/^\d$/.test(variant) || Number(variant) >= VARIANTS.length) {
        return res.status(400).json({ error: 'Invalid variant' });
    }

    const prompt = buildPrompt(colorList, genre.trim(), Number(variant));

    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&width=1080&height=1920&nologo=true`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.POLLINATIONS_KEY}` }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('pollinations error:', response.status, text);
            return res.status(500).json({ error: 'Image generation failed' });
        }

        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('generate-image error:', err);
        res.status(500).json({ error: 'Image generation failed' });
    }
}