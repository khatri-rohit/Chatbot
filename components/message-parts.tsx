'use client';

import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { getToolName, isToolUIPart } from 'ai';
import dynamic from 'next/dynamic';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';

/**
 * Renders one AI SDK `UIMessage.part`.
 *
 * Parts come from `/api/chat` via `toUIMessageStream`:
 *   text            → model tokens (Streamdown typesets Markdown)
 *   tool-*          → LangGraph tools mode (e.g. tool-get_weather)
 *   data-progress   → LangChain `config.writer({ type: 'progress' })`
 *   data-hitl       → route saw a LangGraph interrupt; Approve calls regenerate()
 */

const Streamdown = dynamic(
    () => import('streamdown').then((mod) => mod.Streamdown),
    { ssr: false },
);

export function MessageParts({
    message,
    isStreaming,
    onHitl,
}: {
    message: DeskUIMessage;
    isStreaming: boolean;
    onHitl?: (decision: HitlDecision, pendingCount: number) => void;
}) {
    const text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');

    const hitlPart = message.parts.find((part) => part.type === 'data-hitl');
    const pendingCount = Math.max(
        1,
        (hitlPart?.type === 'data-hitl' ? hitlPart.data.pendingCount : 0) ||
            message.parts.filter(
                (part) =>
                    isToolUIPart(part) && part.state === 'approval-requested',
            ).length,
    );

    const resume =
        onHitl &&
        ((decision: HitlDecision) => {
            onHitl(decision, pendingCount);
        });

    return (
        <div className="flex flex-col gap-3">
            {message.parts.map((part, index) => {
                if (part.type === 'data-progress') {
                    return (
                        <p
                            key={`${message.id}-progress-${index}`}
                            className="font-mono text-[11px] tracking-wide text-ink-soft"
                        >
                            {part.data.message}
                        </p>
                    );
                }

                if (part.type === 'data-hitl') {
                    const alreadyShown = message.parts.some(
                        (candidate) =>
                            isToolUIPart(candidate) &&
                            candidate.state === 'approval-requested',
                    );
                    if (alreadyShown) return null;

                    return (
                        <HitlCard
                            key={`${message.id}-hitl-${index}`}
                            description={part.data.description}
                            actionName={part.data.actionName}
                            args={part.data.arguments}
                            pendingCount={pendingCount}
                            onHitl={resume}
                        />
                    );
                }

                if (isToolUIPart(part)) {
                    return (
                        <ToolCard
                            key={
                                part.toolCallId ?? `${message.id}-tool-${index}`
                            }
                            name={getToolName(part)}
                            state={part.state}
                            input={'input' in part ? part.input : undefined}
                            output={'output' in part ? part.output : undefined}
                            onHitl={
                                part.state === 'approval-requested'
                                    ? resume
                                    : undefined
                            }
                        />
                    );
                }

                return null;
            })}

            {text ? (
                <Streamdown
                    className="assistant-markdown"
                    plugins={{ code, mermaid, math, cjk }}
                    isAnimating={isStreaming}
                >
                    {text}
                </Streamdown>
            ) : null}
        </div>
    );
}

function HitlCard({
    description,
    actionName,
    args,
    pendingCount,
    onHitl,
}: {
    description: string;
    actionName: string;
    args: unknown;
    pendingCount: number;
    onHitl?: (decision: HitlDecision) => void;
}) {
    return (
        <div className="border border-(--rule) bg-paper-deep/40 px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.22em] text-sienna uppercase">
                Needs approval · {actionName}
                {pendingCount > 1 ? ` · ${pendingCount} calls` : ''}
            </p>
            <p className="mt-2 text-sm text-ink">{description}</p>
            {args != null ? (
                <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-ink-soft">
                    {JSON.stringify(args, null, 2)}
                </pre>
            ) : null}
            {onHitl ? (
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            onHitl({ type: 'approve', message: 'Approved' })
                        }
                        className="h-9 rounded-sm bg-sage px-3 font-mono text-[10px] tracking-[0.18em] text-paper uppercase"
                    >
                        Approve
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            onHitl({ type: 'reject', message: 'Denied' })
                        }
                        className="h-9 rounded-sm border border-ink px-3 font-mono text-[10px] tracking-[0.18em] uppercase"
                    >
                        Deny
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function ToolCard({
    name,
    state,
    input,
    output,
    onHitl,
}: {
    name: string;
    state: string;
    input: unknown;
    output: unknown;
    onHitl?: (decision: HitlDecision) => void;
}) {
    return (
        <div className="border border-dashed border-(--rule) px-4 py-3 overflow-x-auto">
            <p className="font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                Tool · {name} · {state}
            </p>
            {input != null ? (
                <p className="mt-2 font-mono text-[12px] text-ink-soft">
                    {JSON.stringify(input)}
                </p>
            ) : null}
            {output != null && state.includes('output') ? (
                <p className="mt-1 text-sm text-ink">
                    {typeof output === 'string'
                        ? output.slice(0, 100)
                        : JSON.stringify(output).slice(0, 100)}
                </p>
            ) : null}
            {onHitl ? (
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            onHitl({ type: 'approve', message: 'Approved' })
                        }
                        className="h-9 rounded-sm bg-sage px-3 font-mono text-[10px] tracking-[0.18em] text-paper uppercase"
                    >
                        Approve
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            onHitl({ type: 'reject', message: 'Denied' })
                        }
                        className="h-9 rounded-sm border border-ink px-3 font-mono text-[10px] tracking-[0.18em] uppercase"
                    >
                        Deny
                    </button>
                </div>
            ) : null}
        </div>
    );
}
