import { getColor } from 'colorthief';

const BASE_URL = 'https://api.spotify.com/v1';

async function fetchData(endpoint) {
    const token = localStorage.getItem('access_token');

    const response  = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.json();
}

export async function getUser() {
    return fetchData('/me');
}

export async function getTopArtists(timeRange) {
    return fetchData(`/me/top/artists?limit=50&time_range=${timeRange}`);
}

export async function getTopTracks(timeRange) {
    return fetchData(`/me/top/tracks?limit=50&time_range=${timeRange}`);
}

export async function getArtistGenres(artistName) {
    const response = await fetch(
        `/api/genres?artist=${encodeURIComponent(artistName)}`
    );
    const data = await response.json();
    return data.genres || [];
}

export async function getTopGenre(artists) {
    const top25 = artists.slice(0, 25);
    const genreResults = [];

    for (const artist of top25) {
        const genres = await getArtistGenres(artist.name);
        genreResults.push(genres);
    }

    const genreCount = {};
    genreResults.flat().filter(genre => typeof genre === 'string').forEach(genre => {
        const normalized = genre.toLowerCase();
        genreCount[normalized] = (genreCount[normalized] || 0) + 1;
    });

    const sorted = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'Unknown';
}

export async function extractColors(tracks) {
    const top5 = tracks.slice(0, 5);

    const colors = await Promise.all(
        top5.map(track => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = track.album.images[0].url;
                img.onload = async () => {
                    const color = await getColor(img);
                    const hex = '#' + color.array().map(x => x.toString(16).padStart(2, '0')).join('');
                    resolve(hex);
                };
            });
        })
    );

    return colors;
}

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
    { structure: 'repeating modular forms, offset frames, geometric rhythm', mood: 'dark dominant composition, strong contrast, concentrated highlights' },
    { structure: 'warped geometric ribbons, layered structures, dynamic movement', mood: 'bright open composition, lighter overall appearance, airy negative space' },
    { structure: 'optical patterns, stacked blocks, structured visual hierarchy', mood: 'bold color-driven composition, high energy, large color fields' }
];

export function generateImages(colors, genre) {
    const uniqueColors = [...new Set(colors)];
    const palette = [...uniqueColors].map(c => c.replace('#', ''));

    while (palette.length < 5) {
        palette.push(palette[palette.length - 1]);
    }

    const geometry = GENRE_GEOMETRY[genre.toLowerCase()] || 'modular composition, layered geometry, rhythmic patterns';

    const prompts = [
        { colors: `${palette[0]}, ${palette[1]}, ${palette[2]}`, variant: VARIANTS[0] },
        { colors: `${palette[2]}, ${palette[3]}, ${palette[1]}`, variant: VARIANTS[1] },
        { colors: `${palette[4]}, ${palette[1]}, ${palette[0]}`, variant: VARIANTS[2] }
    ];

    return prompts.map(({ colors, variant }) => {
        const prompt = `premium abstract visual identity artwork, vertical mobile poster, dominant palette ${colors}, pure abstract geometric design, non-representational, ${geometry}, ${variant.structure}, ${variant.mood}, modular graphic system, stacked geometric layers, cropped oversized forms, framing devices, rhythmic composition, bold negative space, high contrast, clean focal area in upper center, visual complexity around edges, lower section suitable for statistics overlay, modern branding artwork, graphic poster design, contemporary visual identity, generative design system, 2d graphic design, minimal depth, no humans, no people, no portraits, no faces, no eyes, no bodies, no silhouettes, no clothing, no musicians, no performers, no photography, no album covers, no typography, no text, no logos, no icons`;

        return `/api/generate-image?prompt=${encodeURIComponent(prompt)}`;
    });
}