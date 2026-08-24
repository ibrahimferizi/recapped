import {
    connect,
    exchangeToken,
    checkLoggedIn,
    logout
} from './auth.js';

import {
    getTopArtists,
    getTopTracks,
    getTopGenre,
    extractColors,
    generateImages
} from './api.js';

import { generateCard } from './canvas.js';

import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

inject();
injectSpeedInsights();

const showcaseRecaps = [

    {
        image: '/images/showcase/recap-1.jpg',
        name: 'I.',
        caption: 'Wow!'
    },

    {
        image: '/images/showcase/recap-2.jpg',
        name: 'E.',
        caption: 'How is Lana not #1 ?'
    },

    {
        image: '/images/showcase/recap-3.jpg',
        name: 'P.',
        caption: 'Genuinely impressed!'
    },

    {
        image: '/images/showcase/recap-4.jpg',
        name: 'D.',
        caption: 'I like it.'
    }
];

let showcaseIndex = 0;
let showcaseAnimating = false;
let showcaseInterval = null;

const SHOWCASE_INTERVAL = 3000;

const showcaseImage = document.getElementById('showcase-image');
const showcaseName = document.getElementById('showcase-name');
const showcaseCaption = document.getElementById('showcase-caption');
const showcaseCounter = document.getElementById('showcase-counter');
const showcaseDots = document.getElementById('showcase-dots');

const showcaseCard = document.querySelector('.showcase-card');
const showcaseSection = document.querySelector('.showcase');

const showcasePrev = document.getElementById('showcase-prev');
const showcaseNext = document.getElementById('showcase-next');


function updateShowcaseContent() {
    const recap = showcaseRecaps[showcaseIndex];

    showcaseImage.src = recap.image;
    showcaseName.textContent = recap.name;
    showcaseCaption.textContent = recap.caption;

    showcaseCounter.textContent =
        `${String(showcaseIndex + 1).padStart(2, '0')} / ${String(showcaseRecaps.length).padStart(2, '0')}`;

    showcaseDots.innerHTML = '';

    showcaseRecaps.forEach((_, index) => {
        const dot = document.createElement('button');

        dot.className =
            `showcase-dot ${index === showcaseIndex ? 'active' : ''}`;

        dot.setAttribute(
            'aria-label',
            `Show recap ${index + 1}`
        );

        dot.addEventListener('click', () => {
            if (index === showcaseIndex) return;

            changeShowcase(index);
            restartShowcaseAutoplay();
        });

        showcaseDots.appendChild(dot);
    });
}


function changeShowcase(nextIndex) {
    if (showcaseAnimating || nextIndex === showcaseIndex) {
        return;
    }

    showcaseAnimating = true;

    showcaseCard.classList.remove('is-entering');
    showcaseCard.classList.add('is-leaving');

    setTimeout(() => {
        showcaseIndex = nextIndex;

        updateShowcaseContent();

        showcaseCard.classList.remove('is-leaving');

        void showcaseCard.offsetWidth;

        showcaseCard.classList.add('is-entering');

        setTimeout(() => {
            showcaseCard.classList.remove('is-entering');
            showcaseAnimating = false;
        }, 420);

    }, 280);
}


function nextShowcase() {
    const nextIndex =
        (showcaseIndex + 1) % showcaseRecaps.length;

    changeShowcase(nextIndex);
}


function previousShowcase() {
    const nextIndex =
        (showcaseIndex - 1 + showcaseRecaps.length) %
        showcaseRecaps.length;

    changeShowcase(nextIndex);
}


function startShowcaseAutoplay() {
    stopShowcaseAutoplay();

    showcaseInterval = setInterval(() => {
        nextShowcase();
    }, SHOWCASE_INTERVAL);
}


function stopShowcaseAutoplay() {
    if (!showcaseInterval) return;

    clearInterval(showcaseInterval);
    showcaseInterval = null;
}


function restartShowcaseAutoplay() {
    stopShowcaseAutoplay();
    startShowcaseAutoplay();
}


showcasePrev.addEventListener('click', () => {
    previousShowcase();
    restartShowcaseAutoplay();
});


showcaseNext.addEventListener('click', () => {
    nextShowcase();
    restartShowcaseAutoplay();
});


showcaseSection.addEventListener('mouseenter', () => {
    stopShowcaseAutoplay();
});


showcaseSection.addEventListener('mouseleave', () => {
    startShowcaseAutoplay();
});


updateShowcaseContent();
startShowcaseAutoplay();

function show(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

function hide(id) {
    document.getElementById(id)?.classList.add('hidden');
}

const choiceView = document.getElementById('recap-choice');
const loadingView = document.getElementById('recap-loading');
const resultsView = document.getElementById('recap-results');
const errorView = document.getElementById('recap-error');

function showView(view) {
    [choiceView, loadingView, resultsView, errorView].forEach(element => {
        element.classList.add('hidden');
    });

    view.classList.remove('hidden');
}

const stepIds = [
    'step-artists',
    'step-tracks',
    'step-genre',
    'step-colors',
    'step-image',
    'step-card'
];

function resetStep(id) {
    const element = document.getElementById(id);

    if (!element) return;

    element.classList.remove('done', 'active');
}

function setStep(id, state) {
    const element = document.getElementById(id);

    if (!element) return;

    element.classList.remove('done', 'active');
    element.classList.add(state);
}

function resetLoadingSteps() {
    stepIds.forEach(resetStep);
}

let selectedIndex = null;
let currentCanvases = [];
let lastTimeRange = null;

function getYearlyTimeRange() {
    const month = new Date().getMonth();

    return month <= 2
        ? 'short_term'
        : 'medium_term';
}

async function startFlow(timeRange) {

    lastTimeRange = timeRange;
    selectedIndex = null;
    currentCanvases = [];

    resetLoadingSteps();

    showView(loadingView);

    const cards = document.querySelectorAll('.card-wrapper');

    cards.forEach(wrapper => {

        wrapper.classList.remove('selected');

        const canvas = wrapper.querySelector('.result-canvas');

        if (canvas) {
            const ctx = canvas.getContext('2d');

            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );
        }
    });

    hide('btn-download');

    document.getElementById('selection-status').textContent =
        'Select a recap to download it.';


    try {

        setStep('step-artists', 'active');

        const topArtists = await getTopArtists(timeRange);

        setStep('step-artists', 'done');

        setStep('step-tracks', 'active');

        const topTracks = await getTopTracks(timeRange);

        setStep('step-tracks', 'done');

        setStep('step-genre', 'active');

        const topGenre = await getTopGenre(
            topArtists.items
        );

        setStep('step-genre', 'done');

        setStep('step-colors', 'active');

        const colors = await extractColors(
            topTracks.items
        );

        setStep('step-colors', 'done');

        setStep('step-image', 'active');

        const imageUrls = generateImages(
            colors,
            topGenre
        );

        setStep('step-card', 'active');

        currentCanvases = await Promise.all(
            imageUrls.map(url =>
                generateCard(
                    url,
                    topArtists.items,
                    topTracks.items,
                    topGenre
                )
            )
        );

        setStep('step-image', 'done');
        setStep('step-card', 'done');

        currentCanvases.forEach((canvas, index) => {

            const wrapper =
                document.getElementById(`card-${index}`);

            const displayCanvas =
                wrapper.querySelector('.result-canvas');

            displayCanvas.width = 1080;
            displayCanvas.height = 1920;

            const ctx =
                displayCanvas.getContext('2d');

            ctx.clearRect(
                0,
                0,
                displayCanvas.width,
                displayCanvas.height
            );

            ctx.drawImage(
                canvas,
                0,
                0
            );

            wrapper.onclick = () => {
                selectCard(index);
            };

            wrapper.onkeydown = event => {

                if (
                    event.key === 'Enter' ||
                    event.key === ' '
                ) {
                    event.preventDefault();

                    selectCard(index);
                }
            };
        });


        showView(resultsView);

    } catch (err) {

        console.error('Flow failed:', err);

        const loggedIn = await checkLoggedIn();

        if (!loggedIn) {
            hide('screen-main');
            show('screen-connect');
            return;
        }

        let message;

        if (err.message?.includes('429')) {

            message =
                'Too many requests right now. Please wait a minute and try again.';

        } else if (
            err.message?.includes('Image generation failed')
        ) {

            message =
                'We couldn\'t generate the recap background. Please try again.';

        } else {

            message =
                'We couldn\'t create your recap. Please try again.';
        }

        document.getElementById('error-message').textContent =
            message;

        showView(errorView);
    }
}

function selectCard(index) {

    selectedIndex = index;

    document.querySelectorAll('.card-wrapper')
        .forEach(wrapper => {
            wrapper.classList.remove('selected');
        });

    const selectedCard =
        document.getElementById(`card-${index}`);

    selectedCard.classList.add('selected');

    document.getElementById('selection-status').textContent =
        `Recap ${index + 1} selected.`;

    show('btn-download');
}

document
    .getElementById('btn-download')
    .addEventListener('click', () => {

        if (selectedIndex === null) {
            return;
        }

        const link =
            document.createElement('a');

        link.download =
            `recapped-${
                lastTimeRange === 'long_term'
                    ? 'alltime'
                    : 'thisyear'
            }.jpg`;

        link.href =
            currentCanvases[selectedIndex]
                .toDataURL(
                    'image/jpeg',
                    0.95
                );

        link.click();
    });

document
    .getElementById('btn-alltime')
    .addEventListener('click', () => {

        startFlow('long_term');
    });


document
    .getElementById('btn-yearly')
    .addEventListener('click', () => {

        startFlow(
            getYearlyTimeRange()
        );
    });

document
    .getElementById('btn-new-recap')
    .addEventListener('click', () => {

        selectedIndex = null;
        currentCanvases = [];

        showView(choiceView);
    });

document
    .getElementById('btn-retry')
    .addEventListener('click', () => {

        if (lastTimeRange) {
            startFlow(lastTimeRange);
        } else {
            showView(choiceView);
        }
    });


document
    .getElementById('btn-error-back')
    .addEventListener('click', () => {

        showView(choiceView);
    });

async function init() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const code =
        params.get('code');


    if (code) {

        try {

            await exchangeToken(code);

        } catch (err) {

            console.error(
                'Login failed:',
                err
            );
        }

        window.history.replaceState(
            {},
            document.title,
            '/'
        );
    }


    const loggedIn =
        await checkLoggedIn();


    if (loggedIn) {

        hide('screen-connect');
        show('screen-main');

        showView(choiceView);

    } else {

        show('screen-connect');

        document
            .getElementById('oauth')
            .addEventListener(
                'click',
                connect
            );
    }
}


document
    .getElementById('btn-logout')
    .addEventListener(
        'click',
        async () => {

            await logout();

            hide('screen-main');
            show('screen-connect');

            showView(choiceView);
        }
    );

init();

const betaModal =
    document.getElementById('beta-modal');

const betaInfoBtn =
    document.getElementById('beta-info-btn');

const betaModalClose =
    document.getElementById('beta-modal-close');

const betaModalX =
    document.getElementById('beta-modal-x');


function openBetaModal() {
    betaModal.classList.remove('hidden');
}

function closeBetaModal() {
    betaModal.classList.add('hidden');
}


betaInfoBtn.addEventListener(
    'click',
    openBetaModal
);

betaModalClose.addEventListener(
    'click',
    closeBetaModal
);

betaModalX.addEventListener(
    'click',
    closeBetaModal
);

const aboutModal =
    document.getElementById('about-modal');

const aboutBtn =
    document.getElementById('about-btn');

const aboutModalClose =
    document.getElementById('about-modal-close');

const aboutModalX =
    document.getElementById('about-modal-x');


function openAboutModal() {
    aboutModal.classList.remove('hidden');
}

function closeAboutModal() {
    aboutModal.classList.add('hidden');
}


aboutBtn.addEventListener(
    'click',
    openAboutModal
);

aboutModalClose.addEventListener(
    'click',
    closeAboutModal
);

aboutModalX.addEventListener(
    'click',
    closeAboutModal
);

document.addEventListener(
    'keydown',
    event => {

        if (event.key !== 'Escape') {
            return;
        }

        closeBetaModal();
        closeAboutModal();
    }
);