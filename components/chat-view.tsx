'use client';

/**
 * Chat UI — AI SDK `useChat` talking to Deep Agents through `/api/chat`.
 *
 * Connection map:
 *   sendMessage({ text })  →  DefaultChatTransport POST { id, messages }
 *   /api/chat              →  Deep Agent stream → toUIMessageStream
 *   messages[].parts       →  MessageParts (Streamdown + tools + HITL)
 *   Approve/Deny           →  regenerate() with resume.decisions
 *                            →  LangGraph Command on the same thread id
 *   Pin → Web search       → POST webSearchEnabled; internet_search may
 *                            call Firecrawl (off → structured error)
 *
 * `useChat({ id })` is the LangGraph `thread_id`. Stored in sessionStorage
 * so a refresh keeps the same checkpoint.
 */
import { MessageParts } from '@/components/message-parts';
import EmptyState from '@/components/EmptyState';
import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { FormEvent, useEffect, useRef, useState } from 'react';

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
        <article className="ml-auto max-w-[85%]">
            <p className="mb-2 text-right font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase">
                You
            </p>
            <div className="relative">
                <p className="rounded-sm bg-ink px-4 py-3 pr-11 text-paper">
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

const resumeHolders = new WeakMap<
    DefaultChatTransport<DeskUIMessage>,
    {
        resume: { decisions: HitlDecision[] } | null;
        webSearchEnabled: boolean;
    }
>();

function createDeskTransport() {
    const holder: {
        resume: { decisions: HitlDecision[] } | null;
        webSearchEnabled: boolean;
    } = {
        resume: null,
        webSearchEnabled: false,
    };
    const transport = new DefaultChatTransport<DeskUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id,
                messages,
                resume: holder.resume ?? undefined,
                webSearchEnabled: holder.webSearchEnabled,
            },
        }),
    });
    resumeHolders.set(transport, holder);
    return transport;
}

function setTransportResume(
    transport: DefaultChatTransport<DeskUIMessage>,
    resume: { decisions: HitlDecision[] } | null,
) {
    const holder = resumeHolders.get(transport);
    if (holder) holder.resume = resume;
}

function setTransportWebSearch(
    transport: DefaultChatTransport<DeskUIMessage>,
    enabled: boolean,
) {
    const holder = resumeHolders.get(transport);
    if (holder) holder.webSearchEnabled = enabled;
}

const THREAD_STORAGE_KEY = 'atelier-thread';

type StoredThread = {
    id: string;
    messages: DeskUIMessage[];
    webSearchEnabled: boolean;
};

function loadStoredThread(): StoredThread {
    try {
        const raw = sessionStorage.getItem(THREAD_STORAGE_KEY);
        if (!raw) {
            return {
                id: crypto.randomUUID(),
                messages: [],
                webSearchEnabled: false,
            };
        }
        const parsed = JSON.parse(raw) as Partial<StoredThread>;
        if (typeof parsed.id !== 'string' || parsed.id.length < 8) {
            return {
                id: crypto.randomUUID(),
                messages: [],
                webSearchEnabled: false,
            };
        }
        return {
            id: parsed.id,
            messages: Array.isArray(parsed.messages) ? parsed.messages : [],
            webSearchEnabled: Boolean(parsed.webSearchEnabled),
        };
    } catch {
        return {
            id: crypto.randomUUID(),
            messages: [],
            webSearchEnabled: false,
        };
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
        setThread(loadStoredThread());
    }, []);

    if (!thread) {
        return (
            <main className="relative flex min-h-dvh flex-col">
                <header className="mx-auto flex w-full max-w-3xl items-end justify-between px-6 pt-10 pb-6">
                    <div>
                        <p className="font-mono text-[11px] tracking-[0.28em] text-sienna uppercase">
                            Research desk
                        </p>
                        <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
                            Atelier
                        </h1>
                    </div>
                </header>
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
    const endRef = useRef<HTMLDivElement>(null);
    const pinRef = useRef<HTMLDivElement>(null);
    const [transport] = useState(createDeskTransport);
    const chatId = initial.id;
    setTransportWebSearch(transport, webSearchEnabled);

    const { messages, sendMessage, regenerate, status, stop, error } =
        useChat<DeskUIMessage>({
            id: chatId,
            messages: initial.messages,
            transport,
        });

    const onHitl = (decision: HitlDecision, pendingCount: number) => {
        const n = Math.max(1, pendingCount);
        setTransportResume(transport, {
            decisions: Array.from({ length: n }, () => decision),
        });
        void regenerate().finally(() => setTransportResume(transport, null));
    };

    useEffect(() => {
        setTransportWebSearch(transport, webSearchEnabled);
    }, [transport, webSearchEnabled]);

    useEffect(() => {
        saveStoredThread({
            id: chatId,
            messages,
            webSearchEnabled,
        });
    }, [chatId, messages, webSearchEnabled]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, status]);

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
        setTransportResume(transport, null);
        setDraft('');
        void sendMessage({ text: query });
    };

    const busy = status === 'submitted' || status === 'streaming';

    return (
        <main className="relative flex min-h-dvh flex-col">
            <aside className="pointer-events-none absolute top-16 left-5 hidden origin-top-left -rotate-90 font-mono text-[11px] tracking-[0.35em] text-ink-soft uppercase md:block">
                Field notes · Vol. 01
            </aside>

            <header className="mx-auto flex w-full max-w-3xl items-end justify-between px-6 pt-10 pb-6">
                <div>
                    <p className="font-mono text-[11px] tracking-[0.28em] text-sienna uppercase">
                        Research desk
                    </p>
                    <h1 className="mt-2 font-display text-4xl tracking-tight text-ink md:text-5xl">
                        Atelier
                    </h1>
                    <p className="mt-2 max-w-md text-[15px] text-ink-soft">
                        UI messages stream from the desk. Weather and web
                        search stay in this thread so follow-ups remember
                        what was just found.
                    </p>
                </div>
                <span className="hidden font-mono text-[11px] tracking-widest text-sage uppercase sm:block">
                    {busy ? 'In session' : 'Idle'}
                </span>
            </header>

            <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-36">
                {messages.length === 0 ? (
                    <EmptyState onPick={(prompt) => setDraft(prompt)} />
                ) : (
                    <ol className="flex flex-col gap-8">
                        {messages.map((message, index) => {
                            const streamingThis =
                                busy &&
                                index === messages.length - 1 &&
                                message.role === 'assistant';

                            return (
                                <li key={message.id}>
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
                                        <article aria-live="polite">
                                            <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
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
                <div ref={endRef} />
            </section>

            <form
                onSubmit={onSubmit}
                className="fixed inset-x-0 bottom-0 border-t border-(--rule) bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-4 py-4 backdrop-blur-md"
            >
                <div className="mx-auto flex w-full max-w-3xl items-end gap-3">
                    <div ref={pinRef} className="relative shrink-0">
                        <button
                            type="button"
                            aria-label="Tools"
                            aria-expanded={pinOpen}
                            aria-pressed={webSearchEnabled}
                            onClick={() => setPinOpen((open) => !open)}
                            className={`flex h-12 w-12 items-center justify-center rounded-sm border transition-colors focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none ${
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
                                className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-56 border border-(--rule) bg-paper px-1 py-1 shadow-[0_-8px_24px_rgba(36,24,15,0.08)]"
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
                        className="min-h-[3.2rem] flex-1 resize-none rounded-sm border border-(--rule) bg-paper-deep/50 px-4 py-3 outline-none ring-sienna/40 placeholder:text-ink-soft/70 focus:ring-2 disabled:opacity-60"
                    />
                    {busy ? (
                        <button
                            type="button"
                            onClick={() => stop()}
                            className="h-12 rounded-sm border border-ink px-4 font-mono text-xs tracking-[0.18em] uppercase"
                        >
                            Stop
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!draft.trim()}
                            className="h-12 rounded-sm bg-sienna px-5 font-mono text-xs tracking-[0.18em] text-paper uppercase disabled:opacity-40"
                        >
                            Ask
                        </button>
                    )}
                </div>
                {webSearchEnabled ? (
                    <p className="mx-auto mt-2 max-w-3xl font-mono text-[10px] tracking-wide text-sage uppercase">
                        Web search pinned — the desk may look up the live web
                    </p>
                ) : null}
                {error ? (
                    <p
                        className="mx-auto mt-2 max-w-3xl font-mono text-xs text-sienna"
                        role="alert"
                    >
                        {error.message}
                    </p>
                ) : null}
            </form>
        </main>
    );
}
