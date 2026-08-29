'use client';

import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { ToolTrace, type TraceItem } from '@/components/tool-trace';
import { getToolName, isToolUIPart } from 'ai';
import dynamic from 'next/dynamic';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';

/**
 * Renders one assistant message: tool trace, HITL card, then Markdown.
 * Duplicate tool parts collapse so a research loop shows one story.
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

    const parts = collapseParts(message.parts);

    const hitlPart = parts.find((part) => part.type === 'data-hitl');
    const pendingCount = Math.max(
        1,
        (hitlPart?.type === 'data-hitl' ? hitlPart.data.pendingCount : 0) ||
            parts.filter(
                (part) =>
                    isToolUIPart(part) && part.state === 'approval-requested',
            ).length,
    );

    const resume =
        onHitl &&
        ((decision: HitlDecision) => {
            onHitl(decision, pendingCount);
        });

    const blocks = groupTraceBlocks(parts);
    const toolAlreadyShowsApproval = parts.some(
        (part) => isToolUIPart(part) && part.state === 'approval-requested',
    );

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {blocks.map((block, index) => {
                if (block.kind === 'hitl') {
                    if (toolAlreadyShowsApproval) return null;
                    const part = block.part;
                    if (part.type !== 'data-hitl') return null;
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

                return (
                    <ToolTrace
                        key={`${message.id}-trace-${index}`}
                        isStreaming={isStreaming}
                        items={block.items.map((item) =>
                            toTraceItem(item.part, item.index, resume),
                        )}
                    />
                );
            })}

            {text ? (
                <Streamdown
                    className="assistant-markdown min-w-0 max-w-full"
                    plugins={{ code, mermaid, math, cjk }}
                    isAnimating={isStreaming}
                >
                    {text}
                </Streamdown>
            ) : null}
        </div>
    );
}

type IndexedPart = {
    part: DeskUIMessage['parts'][number];
    index: number;
};

type TraceBlock =
    | { kind: 'trace'; items: IndexedPart[] }
    | { kind: 'hitl'; part: DeskUIMessage['parts'][number] };

function groupTraceBlocks(parts: DeskUIMessage['parts']): TraceBlock[] {
    const blocks: TraceBlock[] = [];
    let run: IndexedPart[] = [];

    const flush = () => {
        if (run.length === 0) return;
        blocks.push({ kind: 'trace', items: run });
        run = [];
    };

    parts.forEach((part, index) => {
        if (part.type === 'text') return;
        if (isToolUIPart(part) || part.type === 'data-progress') {
            run.push({ part, index });
            return;
        }
        flush();
        if (part.type === 'data-hitl') {
            blocks.push({ kind: 'hitl', part });
        }
    });

    flush();
    return blocks;
}

function toTraceItem(
    part: DeskUIMessage['parts'][number],
    index: number,
    resume?: (decision: HitlDecision) => void,
): TraceItem {
    if (part.type === 'data-progress') {
        return {
            key: `progress:${index}:${part.data.message}`,
            kind: 'progress',
            message: part.data.message,
        };
    }

    if (!isToolUIPart(part)) {
        return {
            key: `other:${index}`,
            kind: 'progress',
            message: part.type,
        };
    }

    return {
        key: toolPartKey(part, index),
        kind: 'tool',
        name: getToolName(part),
        state: part.state,
        input: 'input' in part ? part.input : undefined,
        output: 'output' in part ? part.output : undefined,
        errorText: 'errorText' in part ? part.errorText : undefined,
        onHitl:
            part.state === 'approval-requested' ? resume : undefined,
    };
}

function collapseParts(parts: DeskUIMessage['parts']): DeskUIMessage['parts'] {
    const latestByKey = new Map<string, DeskUIMessage['parts'][number]>();
    const order: string[] = [];

    for (const part of parts) {
        const key = partKey(part);
        if (!latestByKey.has(key)) order.push(key);
        latestByKey.set(key, part);
    }

    return order.map((key) => latestByKey.get(key)!);
}

function partKey(part: DeskUIMessage['parts'][number]): string {
    if (part.type === 'data-progress') {
        return `progress:${part.data.message}`;
    }
    if (part.type === 'data-hitl') {
        return `hitl:${part.data.actionName}:${part.data.pendingCount}`;
    }
    if (isToolUIPart(part)) {
        return toolPartKey(part);
    }
    if (part.type === 'text') return `text:${part.text.slice(0, 24)}`;
    return part.type;
}

function toolPartKey(
    part: DeskUIMessage['parts'][number],
    fallbackIndex = 0,
): string {
    if (!isToolUIPart(part)) return `part:${fallbackIndex}`;

    const name = getToolName(part);
    const input = 'input' in part ? JSON.stringify(part.input ?? null) : '';

    if (name === 'task' && input) {
        return `task:${input}`;
    }
    if (part.toolCallId) return part.toolCallId;
    return `${name}:${input}:${fallbackIndex}`;
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
        <div className="min-w-0 border border-(--rule) bg-paper-deep/40 px-3 py-3 sm:px-4">
            <p className="font-mono text-[10px] tracking-[0.22em] wrap-break-word text-sienna uppercase">
                Needs approval · {actionName}
                {pendingCount > 1 ? ` · ${pendingCount} calls` : ''}
            </p>
            <p className="mt-2 text-sm wrap-break-word text-ink">{description}</p>
            {args != null ? (
                <pre className="mt-2 max-w-full overflow-x-auto font-mono text-[11px] text-ink-soft">
                    {JSON.stringify(args, null, 2)}
                </pre>
            ) : null}
            {onHitl ? (
                <div className="mt-3 flex flex-wrap gap-2">
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
