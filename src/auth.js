const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || 'http://127.0.0.1:3000/';
const SCOPE = 'user-top-read';

function getVerifier() {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function getChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function getState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function connect() {
    const verifier = getVerifier();
    const challenge = await getChallenge(verifier);
    const state = getState();

    sessionStorage.setItem('verifier', verifier);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
    });

    window.location = `https://accounts.spotify.com/authorize?${params}`;
}

export function consumeState(returned) {
    const expected = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');
    return Boolean(expected) && expected === returned;
}

export async function exchangeToken(code) {
    const verifier = sessionStorage.getItem('verifier');

    const response = await fetch('/api/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, verifier }),
    });

    if (!response.ok) {
        throw new Error('Token exchange failed');
    }

    sessionStorage.removeItem('verifier');
}

export async function getSessionStatus() {
    const response = await fetch('/api/spotify-proxy?endpoint=me', {
        credentials: 'include',
    });
    const error = response.status === 403
        ? await response.json().catch(() => ({}))
        : null;

    return {
        loggedIn: response.ok,
        status: response.status,
        accessDenied: response.status === 403 && error?.error === 'Spotify API error',
    };
}

export async function checkLoggedIn() {
    return (await getSessionStatus()).loggedIn;
}

export async function logout() {
    await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
    });
}
