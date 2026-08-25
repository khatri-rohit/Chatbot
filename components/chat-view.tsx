'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';
import EmptyState from './EmptyState';

type Role = 'user' | 'assistant';

type ChatMessage = {
    id: string;
    role: Role;
    content: string;
};

export default function ChatView() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>(
        'idle',
    );
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, status]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const stop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStatus('idle');
    };

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const query = draft.trim();
        if (!query || status === 'streaming') return;

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: query,
        };
        const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
        };

        const history = [...messages, userMessage];
        setMessages([...history, assistantMessage]);
        setDraft('');
        setError(null);
        setStatus('streaming');

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    messages: history.map(({ role, content }) => ({
                        role,
                        content,
                    })),
                }),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(
                    payload?.error ?? 'The desk could not reach the model.',
                );
            }

            if (!response.body) {
                throw new Error('No response stream was returned.');
            }

            const reader = response.body
                .pipeThrough(new TextDecoderStream())
                .getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;

                setMessages((current) => {
                    const next = [...current];
                    const last = next.at(-1);
                    if (!last || last.role !== 'assistant') return current;
                    next[next.length - 1] = {
                        ...last,
                        content: last.content + value,
                    };
                    return next;
                });
            }

            setStatus('idle');
        } catch (cause) {
            if (controller.signal.aborted) {
                setStatus('idle');
                return;
            }
            setStatus('error');
            setError(
                cause instanceof Error ? cause.message : 'Streaming failed.',
            );
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    };

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
                        Ask a psychology question. Answers stream in as typeset
                        notes — bold, lists, and line breaks rendered, not shown
                        as markup.
                    </p>
                </div>
                <span className="hidden font-mono text-[11px] tracking-widest text-sage uppercase sm:block">
                    {status === 'streaming' ? 'In session' : 'Idle'}
                </span>
            </header>

            <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-36">
                {messages.length === 0 ? (
                    <EmptyState onPick={(prompt) => setDraft(prompt)} />
                ) : (
                    <ol className="flex flex-col gap-8">
                        {messages.map((message, index) => {
                            const streamingThis =
                                status === 'streaming' &&
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
                                                {message.content}
                                            </p>
                                        </article>
                                    ) : (
                                        <article aria-live="polite">
                                            <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                                                Desk
                                            </p>
                                            {message.content ? (
                                                <Streamdown
                                                    className="assistant-markdown"
                                                    plugins={{
                                                        code,
                                                        mermaid,
                                                        math,
                                                        cjk,
                                                    }}
                                                    isAnimating={streamingThis}
                                                >
                                                    {message.content}
                                                </Streamdown>
                                            ) : (
                                                <p className="font-mono text-sm tracking-wide text-ink-soft">
                                                    Composing
                                                    <span className="ml-1 inline-flex gap-1">
                                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sienna" />
                                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sienna [animation-delay:120ms]" />
                                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sienna [animation-delay:240ms]" />
                                                    </span>
                                                </p>
                                            )}
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
                        className="min-h-[3.2rem] flex-1 resize-none rounded-sm border border-(--rule) bg-paper-deep/50 px-4 py-3 outline-none ring-sienna/40 placeholder:text-ink-soft/70 focus:ring-2 scrollbar-thin scrollbar-thumb-gray-400"
                    />
                    {status === 'streaming' ? (
                        <button
                            type="button"
                            onClick={stop}
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
                        {error}
                    </p>
                ) : null}
            </form>
        </main>
    );
}
