'use client';

import { MessageParts } from '@/components/message-parts';
import EmptyState from '@/components/EmptyState';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

function CopyIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
            aria-hidden
            className="h-3.5 w-3.5"
        >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
            <path d="M10.5 5.5V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H5.5" />
        </svg>
    );
}

function PinIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden
            className="h-4 w-4"
        >
            <path d="M10.2 1.15a.85.85 0 0 0-1.2.08L6.5 4.15 4.2 3.5a.85.85 0 0 0-1 .4L2.3 5.7a.85.85 0 0 0 .18 1.05l2.55 2.2-3.15 5.4a.4.4 0 0 0 .7.4l3.35-4.85 2.7 2.35a.85.85 0 0 0 1.08-.08l1.55-1.75a.85.85 0 0 0 .05-.95l-.85-2.25 3.05-2.2a.85.85 0 0 0 .1-1.18L10.2 1.15Z" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-3.5 w-3.5"
        >
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
    );
}

function DeskMasthead({
    compact = false,
    busy,
    children,
}: {
    compact?: boolean;
    busy?: boolean;
    children?: ReactNode;
}) {
    return (
        <header
            className={`mx-auto flex w-full max-w-3xl shrink-0 items-end justify-between gap-3 ${
                compact
                    ? 'px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 sm:px-6 sm:pt-5 sm:pb-4'
                    : 'px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-4 sm:px-6 sm:pt-10 sm:pb-6'
            }`}
        >
            <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] tracking-[0.28em] text-sienna uppercase sm:text-[11px]">
                    Research desk
                </p>
                <h1
                    className={`mt-1 font-display tracking-tight text-ink ${
                        compact
                            ? 'text-2xl sm:text-3xl'
                            : 'text-3xl sm:text-4xl md:text-5xl'
                    }`}
                >
                    Atelier
                </h1>
                {children}
            </div>
            {busy === undefined ? null : (
                <span className="mb-0.5 shrink-0 font-mono text-[10px] tracking-widest text-sage uppercase sm:text-[11px]">
                    {busy ? 'In session' : 'Idle'}
                </span>
            )}
        </header>
    );
}

function UserMessage({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (resetRef.current) clearTimeout(resetRef.current);
        };
    }, []);

    const copy = async () => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (resetRef.current) clearTimeout(resetRef.current);
            resetRef.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard may be blocked */
        }
    };

    return (
        <article className="ml-auto w-fit max-w-[min(100%,22rem)] min-[420px]:max-w-[85%]">
            <p className="mb-1.5 text-right font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase sm:mb-2">
                You
            </p>
            <div className="relative">
                <p className="rounded-sm bg-ink px-3 py-2.5 pr-11 text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap text-paper sm:px-4 sm:py-3 sm:text-base">
                    {text}
                </p>
                <button
                    type="button"
                    onClick={copy}
                    disabled={!text}
                    aria-label={copied ? 'Copied' : 'Copy message'}
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-sm text-paper/55 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:bg-paper/10 focus-visible:text-paper focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none disabled:opacity-30"
                >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
            </div>
        </article>
    );
}

type TransportExtras = {
    resume?: { decisions: HitlDecision[] };
    webSearchEnabled: boolean;
};

const transportExtras = new WeakMap<
    DefaultChatTransport<DeskUIMessage>,
    TransportExtras
>();

function extrasOf(transport: DefaultChatTransport<DeskUIMessage>) {
    return transportExtras.get(transport);
}

function createDeskTransport() {
    const extras: TransportExtras = { webSearchEnabled: false };
    const transport = new DefaultChatTransport<DeskUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id,
                messages,
                resume: extras.resume,
                webSearchEnabled: extras.webSearchEnabled,
            },
        }),
    });
    transportExtras.set(transport, extras);
    return transport;
}

const THREAD_STORAGE_KEY = 'atelier-thread';

type StoredThread = {
    id: string;
    messages: DeskUIMessage[];
    webSearchEnabled: boolean;
};

function emptyThread(): StoredThread {
    return {
        id: crypto.randomUUID(),
        messages: [],
        webSearchEnabled: false,
    };
}

function loadStoredThread(): StoredThread {
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

function saveStoredThread(thread: StoredThread) {
    try {
        sessionStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(thread));
    } catch {
        /* quota / private mode */
    }
}

export default function ChatView() {
    const [thread, setThread] = useState<StoredThread | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setThread(loadStoredThread()), 0);
        return () => window.clearTimeout(timer);
    }, []);

    if (!thread) {
        return (
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <DeskMasthead>
                    <p className="mt-2 max-w-md text-[14px] text-ink-soft sm:text-[15px]">
                        A streaming research assistant for psychology.
                        Literature lookups stay in this thread so follow-ups
                        remember what was just found.
                    </p>
                </DeskMasthead>
            </main>
        );
    }

    return <ChatSession key={thread.id} initial={thread} />;
}

function ChatSession({ initial }: { initial: StoredThread }) {
    const [draft, setDraft] = useState('');
    const [webSearchEnabled, setWebSearchEnabled] = useState(
        initial.webSearchEnabled,
    );
    const [pinOpen, setPinOpen] = useState(false);
    const pinRef = useRef<HTMLDivElement>(null);
    const [transport] = useState(createDeskTransport);
    const chatId = initial.id;
    const bag = extrasOf(transport);
    if (bag) bag.webSearchEnabled = webSearchEnabled;

    const { messages, sendMessage, regenerate, status, stop, error } =
        useChat<DeskUIMessage>({
            id: chatId,
            messages: initial.messages,
            transport,
        });

    const { scrollerRef, contentRef, pin } = useStickToBottom(messages);

    const onHitl = (decision: HitlDecision, pendingCount: number) => {
        const n = Math.max(1, pendingCount);
        const bag = extrasOf(transport);
        if (bag) {
            bag.resume = {
                decisions: Array.from({ length: n }, () => decision),
            };
        }
        pin();
        void regenerate().finally(() => {
            const bag = extrasOf(transport);
            if (bag) bag.resume = undefined;
        });
    };

    useEffect(() => {
        saveStoredThread({
            id: chatId,
            messages,
            webSearchEnabled,
        });
    }, [chatId, messages, webSearchEnabled]);

    useEffect(() => {
        if (!pinOpen) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!pinRef.current?.contains(event.target as Node)) {
                setPinOpen(false);
            }
        };

        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [pinOpen]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const query = draft.trim();
        if (!query || status !== 'ready') return;
        const bag = extrasOf(transport);
        if (bag) bag.resume = undefined;
        setDraft('');
        pin();
        void sendMessage({ text: query });
    };

    const busy = status === 'submitted' || status === 'streaming';
    const compact = messages.length > 0;

    return (
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <aside className="pointer-events-none absolute top-16 left-5 hidden origin-top-left -rotate-90 font-mono text-[11px] tracking-[0.35em] text-ink-soft uppercase lg:block">
                Field notes · Vol. 01
            </aside>

            <DeskMasthead compact={compact} busy={busy}>
                {compact ? null : (
                    <p className="mt-2 max-w-md text-[14px] text-ink-soft sm:text-[15px]">
                        Literature lookups stay in this thread so follow-ups
                        remember what was just found.
                    </p>
                )}
            </DeskMasthead>

            <section
                ref={scrollerRef}
                className="scrollbar-hidden mx-auto min-h-0 w-full min-w-0 max-w-3xl flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none] px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-4 sm:px-6"
            >
                <div ref={contentRef} className="min-w-0">
                    {messages.length === 0 ? (
                        <EmptyState onPick={(prompt) => setDraft(prompt)} />
                    ) : (
                        <ol className="flex min-w-0 flex-col gap-6 sm:gap-8">
                            {messages.map((message, index) => {
                                const streamingThis =
                                    busy &&
                                    index === messages.length - 1 &&
                                    message.role === 'assistant';

                                return (
                                    <li key={message.id} className="min-w-0">
                                        {message.role === 'user' ? (
                                            <UserMessage
                                                text={message.parts
                                                    .flatMap((part) =>
                                                        part.type === 'text'
                                                            ? [part.text]
                                                            : [],
                                                    )
                                                    .join('')}
                                            />
                                        ) : (
                                            <article
                                                aria-live="polite"
                                                className="min-w-0 max-w-full"
                                            >
                                                <p className="mb-1.5 font-mono text-[10px] tracking-[0.22em] text-sage uppercase sm:mb-2">
                                                    Desk
                                                </p>
                                                <MessageParts
                                                    message={message}
                                                    isStreaming={streamingThis}
                                                    onHitl={
                                                        streamingThis
                                                            ? undefined
                                                            : onHitl
                                                    }
                                                />
                                            </article>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </section>

            <form
                onSubmit={onSubmit}
                className="shrink-0 border-t border-(--rule) bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md sm:px-4 sm:pt-4"
            >
                <div className="mx-auto flex w-full min-w-0 max-w-3xl items-end gap-2 sm:gap-3">
                    <div ref={pinRef} className="relative shrink-0">
                        <button
                            type="button"
                            aria-label="Tools"
                            aria-expanded={pinOpen}
                            aria-pressed={webSearchEnabled}
                            onClick={() => setPinOpen((open) => !open)}
                            className={`flex h-11 w-11 items-center justify-center rounded-sm border transition-colors focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none sm:h-12 sm:w-12 ${
                                webSearchEnabled
                                    ? 'border-sage bg-sage text-paper'
                                    : 'border-(--rule) text-ink-soft hover:border-ink hover:text-ink'
                            }`}
                        >
                            <PinIcon />
                        </button>
                        {pinOpen ? (
                            <div
                                role="menu"
                                className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-56 max-w-[calc(100vw-2rem)] border border-(--rule) bg-paper px-1 py-1 shadow-[0_-8px_24px_rgba(36,24,15,0.08)]"
                            >
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={webSearchEnabled}
                                    onClick={() =>
                                        setWebSearchEnabled((on) => !on)
                                    }
                                    className="flex w-full items-center justify-between px-3 py-2.5 text-left font-mono text-[11px] tracking-[0.14em] uppercase hover:bg-paper-deep/70"
                                >
                                    Web search
                                    <span
                                        className={
                                            webSearchEnabled
                                                ? 'text-sage'
                                                : 'text-ink-soft'
                                        }
                                    >
                                        {webSearchEnabled ? 'On' : 'Off'}
                                    </span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <label className="sr-only" htmlFor="query">
                        Question
                    </label>
                    <textarea
                        id="query"
                        rows={2}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                event.currentTarget.form?.requestSubmit();
                            }
                        }}
                        placeholder="What is human emotion?"
                        disabled={busy}
                        enterKeyHint="send"
                        autoComplete="off"
                        className="min-h-11 max-h-36 min-w-0 flex-1 resize-none rounded-sm border border-(--rule) bg-paper-deep/50 px-3 py-2.5 text-base outline-none ring-sienna/40 placeholder:text-ink-soft/70 focus:ring-2 disabled:opacity-60 sm:min-h-[3.2rem] sm:max-h-48 sm:px-4 sm:py-3"
                    />
                    {busy ? (
                        <button
                            type="button"
                            onClick={() => stop()}
                            className="h-11 shrink-0 rounded-sm border border-ink px-3 font-mono text-[11px] tracking-[0.18em] whitespace-nowrap uppercase sm:h-12 sm:px-4 sm:text-xs"
                        >
                            Stop
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!draft.trim()}
                            className="h-11 shrink-0 rounded-sm bg-sienna px-3.5 font-mono text-[11px] tracking-[0.18em] whitespace-nowrap text-paper uppercase disabled:opacity-40 sm:h-12 sm:px-5 sm:text-xs"
                        >
                            Ask
                        </button>
                    )}
                </div>
                {webSearchEnabled ? (
                    <p className="mx-auto mt-2 max-w-3xl font-mono text-[10px] leading-snug tracking-wide text-sage uppercase">
                        Web search pinned — the desk may look up the live web
                    </p>
                ) : null}
                {error ? (
                    <p
                        className="mx-auto mt-2 max-w-3xl font-mono text-xs wrap-break-word text-sienna"
                        role="alert"
                    >
                        {error.message}
                    </p>
                ) : null}
            </form>
        </main>
    );
}
