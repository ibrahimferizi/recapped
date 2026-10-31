import { getColor } from 'colorthief';

async function fetchProxy(endpoint, params = {}) {
    const query = new URLSearchParams({ endpoint, ...params });
    const response = await fetch(`/api/spotify-proxy?${query}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Spotify proxy error: ${response.status}`);
    }

    return response.json();
}

export async function getUser() {
    return fetchProxy('me');
}

export async function getTopArtists(timeRange) {
    return fetchProxy('top-artists', { time_range: timeRange });
}

export async function getTopTracks(timeRange) {
    return fetchProxy('top-tracks', { time_range: timeRange });
}

const genreCache = new Map();
const GENRE_CONCURRENCY = 5;

export async function getArtistGenres(artistName) {
    if (!genreCache.has(artistName)) {
        const request = fetch(`/api/genres?artist=${encodeURIComponent(artistName)}`)
            .then(async response => {
                if (!response.ok) {
                    throw new Error(`Genre lookup error: ${response.status}`);
                }

                const data = await response.json();
                return data.genres || [];
            })
            .catch(error => {
                genreCache.delete(artistName);
                throw error;
            });

        genreCache.set(artistName, request);
    }

    return genreCache.get(artistName);
}

const GENRE_ALIASES = {
    'hip hop': 'hip-hop',
    'hiphop': 'hip-hop',
    'rap': 'hip-hop',
    'trap': 'hip-hop',

    'r&b': 'r&b',
    'rnb': 'r&b',
    'rhythm and blues': 'r&b',

    'edm': 'electronic',
    'electronica': 'electronic',
    'dance': 'electronic',
    'house': 'electronic',
    'techno': 'electronic',

    'indie rock': 'indie',
    'indie pop': 'indie',

    'alternative rock': 'rock',
    'alt rock': 'rock',
    'classic rock': 'rock',
    'hard rock': 'rock',

    'pop rock': 'pop',
    'synth-pop': 'pop',
    'synthpop': 'pop',

    'death metal': 'metal',
    'black metal': 'metal',
    'heavy metal': 'metal',

    'classical music': 'classical',
    'orchestral': 'classical',

    'smooth jazz': 'jazz',
};

function normalizeGenre(genre) {
    const lower = genre.toLowerCase().trim();
    return GENRE_ALIASES[lower] || lower;
}

const GENRE_BLOCKLIST = new Set([
    'seen live', 'female vocalists', 'female vocalist', 'male vocalists', 'male vocalist',
    'american', 'british', 'canadian', 'australian', 'swedish', 'german', 'french', 'uk', 'usa',
    'favorites', 'favourites', 'favorite', 'favourite', 'albums i own',
    'beautiful', 'awesome', 'cool', 'love', 'legend', 'legends'
]);

export async function getTopGenre(artists) {
    const top25 = artists.slice(0, 25);
    const genreResults = [];

    for (let i = 0; i < top25.length; i += GENRE_CONCURRENCY) {
        const genres = await Promise.all(
            top25.slice(i, i + GENRE_CONCURRENCY)
                .map(artist => getArtistGenres(artist.name))
        );
        genreResults.push(...genres);
    }

    const genreCount = Object.create(null);
    genreResults.flat()
        .filter(genre => typeof genre === 'string')
        .map(normalizeGenre)
        .filter(genre => genre && !GENRE_BLOCKLIST.has(genre) && !/^\d{2,4}s$/.test(genre))
        .forEach(genre => {
            genreCount[genre] = (genreCount[genre] || 0) + 1;
        });

    const sorted = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'Unknown';
}

export async function extractColors(tracks) {
    const top5 = tracks.slice(0, 5);

    const colors = await Promise.all(
        top5.map(track => new Promise(resolve => {
            const url = track.album?.images?.[0]?.url;

            if (!url) {
                resolve(null);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = async () => {
                try {
                    const color = await getColor(img);
                    resolve('#' + color.array().map(x => x.toString(16).padStart(2, '0')).join(''));
                } catch {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        }))
    );

    const valid = colors.filter(Boolean);
    return valid.length ? valid : ['#1db954'];
}

export function generateImages(colors, genre) {
    const colorParam = colors.map(c => c.replace('#', '')).join(',');
    const genreParam = encodeURIComponent(genre.slice(0, 50));

    return [0, 1, 2].map(variant =>
        `/api/generate-image?colors=${colorParam}&genre=${genreParam}&variant=${variant}`
    );
}
