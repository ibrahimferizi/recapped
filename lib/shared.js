import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
import { Redis } from '@upstash/redis';

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const isProd = process.env.VERCEL_ENV === 'production';

const ALLOWED_ORIGINS = new Set(['https://recapped-music.vercel.app']);

if (!isProd) {
    ALLOWED_ORIGINS.add('http://127.0.0.1:3000');
}

function originOf(value) {
    try {
        return new URL(value).origin;
    } catch {
        return '';
    }
}

export function isAllowedOrigin(req) {
    const origin = req.headers['origin'];
    if (origin) return ALLOWED_ORIGINS.has(origin);
    const referer = req.headers['referer'];
    return referer ? ALLOWED_ORIGINS.has(originOf(referer)) : false;
}

export function clientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

export function getCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) {
            try {
                return decodeURIComponent(rest.join('='));
            } catch {
                return undefined;
            }
        }
    }
    return undefined;
}

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function isRateLimited(key, limit, windowSeconds) {
    const count = await redis.eval(RATE_LIMIT_SCRIPT, [key], [windowSeconds]);
    return count > limit;
}