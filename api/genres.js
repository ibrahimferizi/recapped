import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export default async function handler(req, res) {
    const { artist } = req.query;

    const response = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${process.env.LASTFM_KEY}&format=json`
    );

    const data = await response.json();
    const genres = data.artist?.tags?.tag?.map(t => t.name) || [];

    res.status(200).json({ genres });
}