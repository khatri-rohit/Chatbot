'use client';

import ChatComposer from '@/components/chat-composer';
import DeskMasthead from '@/components/desk-masthead';
import EmptyState from '@/components/empty-state';
import GeneratingMark from '@/components/generating-mark';
import MessageParts from '@/components/message-parts';
import UserMessage from '@/components/user-message';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import type { StoredThread } from '@/lib/chat-thread';
import { saveStoredThread } from '@/lib/chat-thread';
import {
    createDeskTransport,
    extrasOf,
    type TransportExtras,
} from '@/lib/desk-transport';
import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { useChat } from '@ai-sdk/react';
import { isToolUIPart } from 'ai';
import { FormEvent, useEffect, useRef, useState } from 'react';

export default function ChatSession({ initial }: { initial: StoredThread }) {
    const [draft, setDraft] = useState('');
    const [webSearchEnabled, setWebSearchEnabled] = useState(
        initial.webSearchEnabled,
    );
    const [pinOpen, setPinOpen] = useState(false);
    const pinRef = useRef<HTMLDivElement>(null);
    const [transport] = useState(createDeskTransport);
    const chatId = initial.id;
    const hitlPending = useRef(false);

    const { messages, sendMessage, regenerate, status, stop, error } =
        useChat<DeskUIMessage>({
            id: chatId,
            messages: initial.messages,
            transport,
        });

    const { scrollerRef, contentRef, pin, atBottom } =
        useStickToBottom(messages);

    const applyTransportExtras = (resume?: TransportExtras['resume']) => {
        const extras = extrasOf(transport);
        if (!extras) return;
        extras.webSearchEnabled = webSearchEnabled;
        extras.resume = resume;
    };

    const onHitl = (decision: HitlDecision, pendingCount: number) => {
        if (hitlPending.current) return;
        hitlPending.current = true;
        const n = Math.max(1, pendingCount);
        applyTransportExtras({
            decisions: Array.from({ length: n }, () => decision),
        });
        pin();
        void regenerate().finally(() => {
            hitlPending.current = false;
            const extras = extrasOf(transport);
            if (extras) extras.resume = undefined;
        });
    };

    useEffect(() => {
        const persist = () =>
            saveStoredThread({
                id: chatId,
                messages,
                webSearchEnabled,
            });
        const streaming = status === 'streaming' || status === 'submitted';
        if (!streaming) {
            persist();
            return;
        }
        const timer = window.setTimeout(persist, 400);
        return () => window.clearTimeout(timer);
    }, [chatId, messages, webSearchEnabled, status]);

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
        applyTransportExtras(undefined);
        setDraft('');
        pin();
        void sendMessage({ text: query });
    };

    const busy = status === 'submitted' || status === 'streaming';
    const compact = messages.length > 0;
    const last = messages.at(-1);
    const awaitingHitl = last?.role === 'assistant' && isHitlWait(last);
    const generating = busy && !awaitingHitl;
    const waitingForTokens =
        generating &&
        (last?.role !== 'assistant' ||
            !assistantText(last) ||
            hasLiveTool(last));

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

            <div className="relative mx-auto min-h-0 w-full min-w-0 max-w-3xl flex-1">
                <section
                    ref={scrollerRef}
                    className="scrollbar-hidden absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none] px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-4 sm:px-6"
                >
                    <div ref={contentRef} className="min-w-0">
                        {messages.length === 0 ? (
                            <EmptyState onPick={setDraft} />
                        ) : (
                            <>
                                <ol
                                    className="flex min-w-0 flex-col gap-6 sm:gap-8"
                                    aria-busy={busy}
                                >
                                    {messages.map((message, index) => {
                                        const streamingThis =
                                            busy &&
                                            index === messages.length - 1 &&
                                            message.role === 'assistant';

                                        return (
                                            <li
                                                key={message.id}
                                                className="min-w-0"
                                            >
                                                {message.role === 'user' ? (
                                                    <UserMessage
                                                        text={message.parts
                                                            .flatMap((part) =>
                                                                part.type ===
                                                                'text'
                                                                    ? [
                                                                          part.text,
                                                                      ]
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
                                                            Atelier
                                                        </p>
                                                        <MessageParts
                                                            message={message}
                                                            isStreaming={
                                                                streamingThis
                                                            }
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
                                <div className="flex min-h-30 justify-center pt-8">
                                    {generating && atBottom ? (
                                        <GeneratingMark
                                            busy
                                            canJump={false}
                                            waiting={waitingForTokens}
                                            onJump={pin}
                                        />
                                    ) : null}
                                </div>
                            </>
                        )}
                    </div>
                </section>
                {compact && !atBottom ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                        <div className="pointer-events-auto">
                            <GeneratingMark
                                busy={generating}
                                canJump
                                waiting={waitingForTokens}
                                onJump={pin}
                            />
                        </div>
                    </div>
                ) : null}
            </div>

            <ChatComposer
                draft={draft}
                onDraftChange={setDraft}
                busy={busy}
                webSearchEnabled={webSearchEnabled}
                onToggleWebSearch={() => setWebSearchEnabled((on) => !on)}
                pinOpen={pinOpen}
                onTogglePin={() => setPinOpen((open) => !open)}
                pinRef={pinRef}
                onSubmit={onSubmit}
                onStop={() => stop()}
                errorMessage={error?.message}
            />
        </main>
    );
}

function assistantText(message: DeskUIMessage): string {
    return message.parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('')
        .trim();
}

function hasLiveTool(message: DeskUIMessage): boolean {
    return message.parts.some(
        (part) =>
            isToolUIPart(part) &&
            (part.state === 'input-streaming' ||
                part.state === 'input-available' ||
                part.state === 'approval-requested'),
    );
}

function isHitlWait(message: DeskUIMessage): boolean {
    if (message.parts.some((part) => part.type === 'data-hitl')) return true;
    return message.parts.some(
        (part) => isToolUIPart(part) && part.state === 'approval-requested',
    );
}
