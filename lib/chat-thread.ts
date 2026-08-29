import type { DeskUIMessage } from '@/lib/ai/types';

const THREAD_STORAGE_KEY = 'atelier-thread';

export type StoredThread = {
    id: string;
    messages: DeskUIMessage[];
    webSearchEnabled: boolean;
};

export function emptyThread(): StoredThread {
    return {
        id: crypto.randomUUID(),
        messages: [],
        webSearchEnabled: false,
    };
}

export function loadStoredThread(): StoredThread {
    try {
        const raw = sessionStorage.getItem(THREAD_STORAGE_KEY);
        if (!raw) return emptyThread();
        const parsed = JSON.parse(raw) as Partial<StoredThread>;
        if (typeof parsed.id !== 'string' || parsed.id.length < 8) {
            return emptyThread();
        }
        return {
            id: parsed.id,
            messages: Array.isArray(parsed.messages) ? parsed.messages : [],
            webSearchEnabled: Boolean(parsed.webSearchEnabled),
        };
    } catch {
        return emptyThread();
    }
}

export function saveStoredThread(thread: StoredThread) {
    try {
        sessionStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(thread));
    } catch {
        /* quota / private mode */
    }
}
