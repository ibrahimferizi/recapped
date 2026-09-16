const STORAGE_KEY = 'recapped:pending-completions';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const pending = new Map();
let flushing = false;

function savePending() {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...pending.values()]));
    } catch {}
}

export async function flushRecapCompletions() {
    if (flushing) return;
    flushing = true;

    try {
        for (const [id, completion] of pending) {
            if (Date.now() - Date.parse(completion.completedAt) > MAX_AGE_MS) {
                pending.delete(id);
                continue;
            }

            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const response = await fetch('/api/recap-completed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        keepalive: true,
                        signal: AbortSignal.timeout(10000),
                        body: JSON.stringify(completion),
                    });

                    if (response.ok || response.status === 400) {
                        pending.delete(id);
                        break;
                    }

                    if (response.status === 401 || response.status === 403) break;
                } catch {}

                if (attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
                }
            }

            savePending();
        }
    } finally {
        savePending();
        flushing = false;
    }
}

export function recordRecapCompletion(recapId) {
    try {
        if (!pending.has(recapId)) {
            pending.set(recapId, { recapId, completedAt: new Date().toISOString() });
            savePending();
        }
        void flushRecapCompletions();
    } catch {}
}

try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) {
        for (const completion of saved) {
            if (typeof completion?.recapId === 'string' && typeof completion.completedAt === 'string'
                && Number.isFinite(Date.parse(completion.completedAt))) {
                pending.set(completion.recapId, completion);
            }
        }
    }
} catch {}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void flushRecapCompletions(); });
}
