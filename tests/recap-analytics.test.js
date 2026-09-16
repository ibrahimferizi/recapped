import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHandler } from '../api/recap-completed.js';

const timestamp = Date.parse('2026-09-16T23:59:00.000Z');
const sessionId = randomUUID();

function setup() {
    const markers = new Set();
    const totals = new Map();
    const logs = [];
    let sessionExists = true;
    const redis = {
        async eval(script, keys, [day]) {
            assert.match(script, /HINCRBY/);
            assert.match(script, /604800/);
            assert.equal(keys[0], `session:${sessionId}`);
            assert.equal(keys[2], 'recapped:analytics:daily');
            if (!sessionExists) return [-1, 0];
            if (markers.has(keys[1])) return [0, 0];
            markers.add(keys[1]);
            totals.set(day, (totals.get(day) || 0) + 1);
            return [1, totals.get(day)];
        },
    };
    const handler = createHandler({ redis, log: line => logs.push(JSON.parse(line)), now: () => timestamp, environment: 'production' });
    const request = (overrides = {}) => ({
        method: 'POST',
        headers: { origin: 'https://recapped-music.vercel.app', cookie: `session_id=${sessionId}` },
        body: { recapId: randomUUID(), completedAt: new Date(timestamp).toISOString() },
        ...overrides,
    });
    async function send(req, target = handler) {
        const res = {
            headers: {},
            setHeader(name, value) { this.headers[name] = value; },
            status(code) { this.code = code; return this; },
            json(body) { this.body = body; return this; },
            end() { return this; },
        };
        await target(req, res);
        return res;
    }
    return { redis, logs, totals, request, send, expireSession: () => { sessionExists = false; } };
}

test('concurrent delivery and retries record one completion with an anonymous log', async () => {
    const state = setup();
    const req = state.request();
    const responses = await Promise.all(Array.from({ length: 10 }, () => state.send(req)));
    assert.equal(responses.filter(res => res.code === 201).length, 1);
    assert.equal(responses.filter(res => res.code === 200).length, 9);
    assert.deepEqual(state.logs, [{ event: 'recap_generated', version: 1, day: '2026-09-16', daily_total: 1 }]);
    assert.equal(state.totals.get('2026-09-16'), 1);
    assert.equal(responses[0].headers['Cache-Control'], 'no-store');
    req.body.completedAt = '2026-09-17T00:00:00.000Z';
    assert.equal((await state.send(req)).code, 200);
    assert.equal(state.logs.length, 1);
});

test('separate recaps in the same login count separately and use the completion UTC day', async () => {
    const state = setup();
    await state.send(state.request());
    await state.send(state.request());
    const yesterday = state.request();
    yesterday.body.completedAt = '2026-09-15T23:59:30.000Z';
    await state.send(yesterday);
    assert.equal(state.totals.get('2026-09-16'), 2);
    assert.equal(state.totals.get('2026-09-15'), 1);
});

test('a lost Redis acknowledgement cannot increment a retry twice', async () => {
    const state = setup();
    const req = state.request();
    let first = true;
    const handler = createHandler({
        redis: { async eval(...args) {
            const result = await state.redis.eval(...args);
            if (first) {
                first = false;
                throw new Error('response lost after commit');
            }
            return result;
        } },
        log: () => assert.fail('A duplicate must not emit a success log'),
        now: () => timestamp, environment: 'production',
    });
    assert.equal((await state.send(req, handler)).code, 503);
    assert.equal((await state.send(req, handler)).code, 200);
    assert.equal(state.totals.get('2026-09-16'), 1);
});

test('invalid, unauthenticated, expired and cross-origin requests never count', async () => {
    const state = setup();
    const cases = [
        [state.request({ method: 'GET' }), 405],
        [state.request({ headers: { origin: 'https://recapped-music.vercel.app.evil.test' } }), 403],
        [state.request({ headers: { origin: 'https://recapped-music.vercel.app' } }), 401],
        [state.request({ body: {} }), 400],
        [state.request({ body: { recapId: randomUUID(), completedAt: '2026-09-14T00:00:00Z' } }), 400],
        [state.request({ body: { recapId: randomUUID(), completedAt: '2026-09-18T00:00:00Z' } }), 400],
    ];
    for (const [req, status] of cases) assert.equal((await state.send(req)).code, status);
    state.expireSession();
    assert.equal((await state.send(state.request())).code, 401);
    assert.equal(state.logs.length, 0);
    assert.equal(state.totals.size, 0);
});

test('preview skips tracking and Redis failure returns a retryable status without success logs', async () => {
    const state = setup();
    for (const environment of ['preview', 'development']) {
        const handler = createHandler({ redis: { eval() { assert.fail('Redis must not be called'); } }, environment });
        assert.equal((await state.send(state.request(), handler)).code, 204);
    }
    const handler = createHandler({
        redis: { async eval() { throw new Error('private details'); } },
        log: () => assert.fail('No success log'), now: () => timestamp, environment: 'production',
    });
    const response = await state.send(state.request(), handler);
    assert.equal(response.code, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /private details/);
});

test('the flow records once after all variants are drawn, never on generation or drawing failure', async () => {
    const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
    const flow = source.slice(source.indexOf('async function startFlow('), source.indexOf('\nfunction selectCard('));
    for (const failure of [null, 'generation', 'drawing']) {
        const events = [];
        let generated = 0;
        let drawn = 0;
        const context = {
            crypto: { randomUUID }, lastTimeRange: null, selectedIndex: null, currentCanvases: [],
            resetLoadingSteps() {}, setStep() {}, hide() {}, show() {},
            loadingView: 'loading', resultsView: 'results', errorView: 'error',
            showView(view) { events.push(view); },
            document: {
                querySelectorAll() { return []; },
                getElementById() {
                    return { querySelector() { return { getContext() { return {
                        clearRect() {},
                        drawImage() { if (failure === 'drawing') throw new Error('drawing'); drawn++; },
                    }; } }; } };
                },
            },
            getTopArtists: async () => ({ items: [] }), getTopTracks: async () => ({ items: [] }),
            getTopGenre: async () => 'pop', extractColors: async () => [],
            generateImages: () => ['one', 'two', 'three'],
            generateCard: async url => {
                generated++;
                if (failure === 'generation' && url === 'two') throw new Error('generation');
                return {};
            },
            recordRecapCompletion(id) {
                assert.match(id, /^[0-9a-f-]{36}$/);
                assert.equal(generated, 3);
                assert.equal(drawn, 3);
                assert.equal(events.at(-1), 'results');
                events.push('recorded');
            },
            checkLoggedIn: async () => true, console: { error() {} },
        };
        vm.createContext(context);
        await vm.runInContext(`${flow}\nstartFlow('long_term')`, context);
        assert.equal(events.filter(event => event === 'recorded').length, failure ? 0 : 1);
        assert.equal(events.at(-1), failure ? 'error' : 'recorded');
    }
});

test('browser retries reuse the same payload and pending completion survives a refresh', async () => {
    const source = (await readFile(new URL('../src/recap-analytics.js', import.meta.url), 'utf8')).replaceAll('export ', '');
    const storage = new Map();
    const payloads = [];
    const recapId = randomUUID();
    const makeContext = fetch => vm.createContext({
        fetch, Date, Map, JSON, AbortSignal,
        setTimeout: callback => { callback(); },
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    });
    const first = makeContext(async (url, options) => {
        assert.equal(url, '/api/recap-completed');
        payloads.push(JSON.parse(options.body));
        throw new Error('connection lost after commit');
    });
    vm.runInContext(source, first);
    vm.runInContext(`recordRecapCompletion('${recapId}')`, first);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(payloads.length, 3);
    assert.ok(payloads.every(payload => JSON.stringify(payload) === JSON.stringify(payloads[0])));
    assert.deepEqual(Object.keys(payloads[0]).sort(), ['completedAt', 'recapId']);
    const second = makeContext(async (url, options) => {
        assert.deepEqual(JSON.parse(options.body), payloads[0]);
        return { ok: true, status: 200 };
    });
    vm.runInContext(source, second);
    await vm.runInContext('flushRecapCompletions()', second);
    assert.equal(storage.get('recapped:pending-completions'), '[]');
});
