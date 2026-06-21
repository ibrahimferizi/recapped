import { connect, exchangeToken, checkLoggedIn, logout } from './auth.js';
import { getTopArtists, getTopTracks, getTopGenre, extractColors, generateImages } from './api.js';
import { generateCard } from './canvas.js';

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function resetStep(id) {
    const el = document.getElementById(id);
    el.classList.remove('done', 'active');
}

function setStep(id, state) {
    const el = document.getElementById(id);
    el.classList.remove('done', 'active');
    el.classList.add(state);
}

function setButtonsDisabled(disabled) {
    document.getElementById('btn-alltime').disabled = disabled;
    document.getElementById('btn-yearly').disabled = disabled;
}

function getYearlyTimeRange() {
    const month = new Date().getMonth();
    return month <= 2 ? 'short_term' : 'medium_term';
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        try {
            await exchangeToken(code);
        } catch (err) {
            console.error('Login failed:', err);
        }
        window.history.replaceState({}, document.title, '/');
    }

    const loggedIn = await checkLoggedIn();

    if (loggedIn) {
        hide('screen-connect');
        show('screen-main');
    } else {
        show('screen-connect');
        document.getElementById('oauth').addEventListener('click', connect);
    }
}

init();

document.getElementById('btn-alltime').addEventListener('click', () => startFlow('long_term'));
document.getElementById('btn-yearly').addEventListener('click', () => startFlow(getYearlyTimeRange()));
document.getElementById('btn-retry').addEventListener('click', () => {
    if (lastTimeRange) startFlow(lastTimeRange);
});
document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    hide('screen-main');
    show('screen-connect');
});

let selectedIndex = null;
let currentCanvases = [];
let lastTimeRange = null;

async function startFlow(timeRange) {
    lastTimeRange = timeRange;
    selectedIndex = null;
    currentCanvases = [];
    setButtonsDisabled(true);
    hide('btn-download');
    hide('results-section');
    hide('error-section');
    show('skeleton-section');

    ['step-artists', 'step-tracks', 'step-genre', 'step-colors', 'step-image', 'step-card'].forEach(resetStep);
    show('loading-section');

    document.querySelectorAll('.card-wrapper').forEach(w => {
        w.classList.remove('selected');
        const canvas = w.querySelector('.result-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    try {
        setStep('step-artists', 'active');
        const topArtists = await getTopArtists(timeRange);
        setStep('step-artists', 'done');

        setStep('step-tracks', 'active');
        const topTracks = await getTopTracks(timeRange);
        setStep('step-tracks', 'done');

        setStep('step-genre', 'active');
        const topGenre = await getTopGenre(topArtists.items);
        setStep('step-genre', 'done');

        setStep('step-colors', 'active');
        const colors = await extractColors(topTracks.items);
        setStep('step-colors', 'done');

        setStep('step-image', 'active');
        const imageUrls = generateImages(colors, topGenre);

        setStep('step-card', 'active');
        currentCanvases = await Promise.all(
            imageUrls.map(url => generateCard(url, topArtists.items, topTracks.items, topGenre))
        );
        setStep('step-image', 'done');
        setStep('step-card', 'done');

        hide('skeleton-section');
        show('results-section');

        currentCanvases.forEach((canvas, i) => {
            const wrapper = document.getElementById(`card-${i}`);
            const displayCanvas = wrapper.querySelector('.result-canvas');
            displayCanvas.width = 1080;
            displayCanvas.height = 1920;
            const ctx = displayCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);

            wrapper.onclick = () => {
                document.querySelectorAll('.card-wrapper').forEach(w => w.classList.remove('selected'));
                wrapper.classList.add('selected');
                selectedIndex = i;
                show('btn-download');
            };
        });

        document.getElementById('btn-download').onclick = () => {
            if (selectedIndex === null) return;
            const link = document.createElement('a');
            link.download = `recapped-${timeRange === 'long_term' ? 'alltime' : 'thisyear'}.jpg`;
            link.href = currentCanvases[selectedIndex].toDataURL('image/jpeg', 0.95);
            link.click();
        };

    } catch (err) {
        console.error('Flow failed:', err);
        hide('loading-section');
        hide('skeleton-section');
        if (!isLoggedIn()) {
            hide('screen-main');
            show('screen-connect');
            return;
        }

        const message = err.message.includes('429')
            ? 'Too many requests right now — please wait a minute and try again.'
            : err.message.includes('Image generation failed')
                ? 'Background generation failed — please try again.'
                : 'Something went wrong. Please try again.';

        document.getElementById('error-message').textContent = message;
        show('error-section');
    } finally {
        setButtonsDisabled(false);
    }
}