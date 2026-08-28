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
 *
 * Duplicate `task` retries (same toolCallId or same name+input) collapse
 * to the latest state so the desk shows one research story.
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

    return (
        <div className="flex flex-col gap-3">
            {parts.map((part, index) => {
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
                    const alreadyShown = parts.some(
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
                            key={toolPartKey(part, index)}
                            name={getToolName(part)}
                            state={part.state}
                            input={'input' in part ? part.input : undefined}
                            output={'output' in part ? part.output : undefined}
                            errorText={
                                'errorText' in part ? part.errorText : undefined
                            }
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
    errorText,
    onHitl,
}: {
    name: string;
    state: string;
    input: unknown;
    output: unknown;
    errorText?: string;
    onHitl?: (decision: HitlDecision) => void;
}) {
    const failed = state.includes('error');
    const interruptPause =
        failed &&
        typeof errorText === 'string' &&
        /"actionRequests"\s*:/.test(errorText);
    const inFlight =
        (name === 'task' || name === 'internet_search' || name === 'get_weather') &&
        ((!state.includes('output') && state !== 'approval-requested') ||
            interruptPause);
    const summary = failed
        ? errorText ||
          (typeof output === 'string' ? output : JSON.stringify(output ?? ''))
        : typeof output === 'string'
          ? output
          : output != null
            ? JSON.stringify(output)
            : '';
    const searchHits = asSearchHits(output);
    const inFlightLabel =
        name === 'internet_search'
            ? 'Searching…'
            : name === 'get_weather'
              ? 'Fetching weather…'
              : 'Researching…';

    return (
        <div className="border border-dashed border-(--rule) px-4 py-3 overflow-x-auto">
            <p className="font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                {inFlight
                    ? inFlightLabel
                    : `Tool · ${name} · ${state}`}
            </p>
            {input != null && !inFlight ? (
                <p className="mt-2 font-mono text-[12px] text-ink-soft">
                    {formatToolInput(input)}
                </p>
            ) : null}
            {failed && !interruptPause && summary ? (
                <p className="mt-1 text-sm text-ink">{clip(summary, 400)}</p>
            ) : output != null && state.includes('output') ? (
                searchHits ? (
                    <SearchHits output={searchHits} />
                ) : (
                    <pre className="mt-2 max-h-56 overflow-auto font-mono text-[11px] text-ink">
                        {clip(pretty(output), 1600)}
                    </pre>
                )
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

type SearchHit = {
    title?: string;
    url?: string;
    snippet?: string;
};

type SearchOutput = {
    query?: string;
    results: SearchHit[];
    error?: string;
};

function asSearchHits(output: unknown): SearchOutput | null {
    if (!output || typeof output !== 'object') return null;
    const rec = output as { results?: unknown; query?: unknown; error?: unknown };
    if (!Array.isArray(rec.results)) return null;
    return {
        query: typeof rec.query === 'string' ? rec.query : undefined,
        results: rec.results.filter(
            (item): item is SearchHit => !!item && typeof item === 'object',
        ),
        error: typeof rec.error === 'string' ? rec.error : undefined,
    };
}

function SearchHits({ output }: { output: SearchOutput }) {
    return (
        <div className="mt-2 flex flex-col gap-2">
            {output.error ? (
                <p className="text-sm text-sienna">{output.error}</p>
            ) : null}
            {output.results.map((hit, index) => (
                <div key={`${hit.url ?? index}`} className="text-sm text-ink">
                    <p className="font-medium">
                        {index + 1}. {hit.title || hit.url || 'Result'}
                    </p>
                    {hit.url ? (
                        <a
                            href={hit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[11px] text-sage break-all underline-offset-2 hover:underline"
                        >
                            {hit.url}
                        </a>
                    ) : null}
                    {hit.snippet ? (
                        <p className="mt-0.5 text-[13px] text-ink-soft">
                            {hit.snippet}
                        </p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

function formatToolInput(input: unknown): string {
    if (input && typeof input === 'object' && 'query' in input) {
        const query = (input as { query?: unknown }).query;
        if (typeof query === 'string') return query;
    }
    return clip(pretty(input), 240);
}

function pretty(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}
