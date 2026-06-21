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

export async function connect() {
    const verifier = getVerifier();
    const challenge = await getChallenge(verifier);

    sessionStorage.setItem('verifier', verifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        code_challenge_method: 'S256',
        code_challenge: challenge,
    });

    window.location = `https://accounts.spotify.com/authorize?${params}`;
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

export async function refreshAccessToken() {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) throw new Error('No session');

    const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('session_id');
        throw new Error('Refresh failed, please reconnect');
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    return data.access_token;
}

export async function checkLoggedIn() {
    const response = await fetch('/api/spotify-proxy?endpoint=me', {
        credentials: 'include',
    });
    return response.ok;
}

export async function logout() {
    await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
    });
}