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
 */
import { MessageParts } from '@/components/message-parts';
import EmptyState from '@/components/EmptyState';
import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { FormEvent, useEffect, useRef, useState } from 'react';

const resumeHolders = new WeakMap<
    DefaultChatTransport<DeskUIMessage>,
    { resume: { decisions: HitlDecision[] } | null }
>();

function createDeskTransport() {
    const holder: { resume: { decisions: HitlDecision[] } | null } = {
        resume: null,
    };
    const transport = new DefaultChatTransport<DeskUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id,
                messages,
                resume: holder.resume ?? undefined,
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

export default function ChatView() {
    const [draft, setDraft] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const [transport] = useState(createDeskTransport);

    const { messages, sendMessage, regenerate, status, stop, error } =
        useChat<DeskUIMessage>({
            transport,
        });

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, status]);

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const query = draft.trim();
        if (!query || status !== 'ready') return;
        setTransportResume(transport, null);
        setDraft('');
        void sendMessage({ text: query });
    };

    const onHitl = (decision: HitlDecision) => {
        setTransportResume(transport, { decisions: [decision] });
        void regenerate().finally(() => {
            setTransportResume(transport, null);
        });
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
                        UI messages stream from the Deep Agent. Markdown is
                        typeset live; tools and approvals show as cards.
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
                                        <article className="ml-auto max-w-[85%]">
                                            <p className="mb-2 text-right font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase">
                                                You
                                            </p>
                                            <p className="rounded-sm bg-ink px-4 py-3 text-paper">
                                                {message.parts
                                                    .flatMap((part) =>
                                                        part.type === 'text'
                                                            ? [part.text]
                                                            : [],
                                                    )
                                                    .join('')}
                                            </p>
                                        </article>
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
