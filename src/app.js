import { connect, exchangeToken } from './auth.js';
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

const params = new URLSearchParams(window.location.search);
const code = params.get('code');

if (code) {
    await exchangeToken(code);
    window.history.replaceState({}, document.title, '/');
}

if (localStorage.getItem('access_token')) {
    hide('screen-connect');
    show('screen-main');
} else {
    show('screen-connect');
    document.getElementById('oauth').addEventListener('click', connect);
}

document.getElementById('btn-alltime').addEventListener('click', () => startFlow('long_term'));
document.getElementById('btn-yearly').addEventListener('click', () => startFlow('medium_term'));

let selectedIndex = null;
let currentCanvases = [];

async function startFlow(timeRange) {
    selectedIndex = null;
    currentCanvases = [];
    setButtonsDisabled(true);
    hide('btn-download');
    hide('results-section');

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
    } finally {
        setButtonsDisabled(false);
    }
}