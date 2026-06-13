import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export default async function handler(req, res) {
    const { prompt } = req.query;

    console.log('prompt received:', prompt?.slice(0, 50));
    console.log('key exists:', !!process.env.POLLINATIONS_KEY);

    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&width=1080&height=1920&nologo=true&key=${process.env.POLLINATIONS_KEY}`;

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