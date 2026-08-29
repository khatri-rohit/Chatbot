import type { DeskUIMessage } from '@/lib/ai/types';

const THREAD_STORAGE_KEY = 'atelier-thread';

export type StoredThread = {
    id: string;
    messages: DeskUIMessage[];
    webSearchEnabled: boolean;
};

export function emptyThread(): StoredThread {
    return {
        id: newThreadId(),
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
            messages: restoreMessages(parsed.messages),
            webSearchEnabled: Boolean(parsed.webSearchEnabled),
        };
    } catch {
        return emptyThread();
    }
}

function newThreadId(): string {
    try {
        if (typeof crypto?.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        /* insecure context / missing Web Crypto */
    }
    return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function restoreMessages(raw: unknown): DeskUIMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRestoredMessage);
}

function isRestoredMessage(value: unknown): value is DeskUIMessage {
    if (value == null || typeof value !== 'object') return false;
    const rec = value as Record<string, unknown>;
    return (
        typeof rec.id === 'string' &&
        typeof rec.role === 'string' &&
        Array.isArray(rec.parts)
    );
}

export function saveStoredThread(thread: StoredThread) {
    try {
        sessionStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(thread));
    } catch {
        /* quota / private mode */
    }
}
