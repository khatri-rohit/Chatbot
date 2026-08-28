'use client';

import type { HitlDecision } from '@/lib/ai/types';
import { useEffect, useId, useRef, useState } from 'react';

export type TraceTool = {
    key: string;
    kind: 'tool';
    name: string;
    state: string;
    input: unknown;
    output: unknown;
    errorText?: string;
    onHitl?: (decision: HitlDecision) => void;
};

export type TraceProgress = {
    key: string;
    kind: 'progress';
    message: string;
};

export type TraceItem = TraceTool | TraceProgress;

export function ToolTrace({
    items,
    isStreaming,
}: {
    items: TraceItem[];
    isStreaming: boolean;
}) {
    const tools = items.filter(
        (item): item is TraceTool => item.kind === 'tool',
    );
    const live = isStreaming || tools.some((tool) => isLiveState(tool.state));
    const needsApproval = tools.some(
        (tool) => tool.state === 'approval-requested' && tool.onHitl,
    );
    const [open, setOpen] = useState(live || needsApproval);
    const panelId = useId();
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (live || needsApproval) {
            setTimeout(() => {
                setOpen(true);
            }, 100);
        } else {
            const timer = setTimeout(() => {
                setOpen(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [live, needsApproval]);

    useEffect(() => {
        if (!open) return;
        const list = listRef.current;
        if (!list) return;
        list.scrollTop = list.scrollHeight;
    }, [open, items]);

    if (items.length === 0) return null;

    const latest = tools.at(-1);
    const summary = live
        ? latest
            ? liveLabel(latest)
            : 'Working…'
        : tools.length === 1
          ? `Used ${displayName(tools[0].name)}`
          : `Used ${tools.length} tools`;

    return (
        <div className="border border-dashed border-(--rule)">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
                className="flex h-12 w-full items-center gap-3 px-4 text-left focus-visible:bg-paper-deep/50 focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none"
            >
                <Chevron open={open} />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                    {summary}
                </span>
                {live ? (
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-sage" />
                ) : (
                    <span className="font-mono text-[10px] tabular-nums tracking-widest text-ink-soft">
                        {tools.length}
                    </span>
                )}
            </button>
            {open ? (
                <div
                    id={panelId}
                    role="region"
                    aria-label="Tool calls"
                    ref={listRef}
                    className={`overflow-y-auto border-t border-(--rule) ${
                        live ? 'h-50' : 'max-h-50'
                    }`}
                >
                    {items.map((item) =>
                        item.kind === 'progress' ? (
                            <p
                                key={item.key}
                                className="border-b border-(--rule)/60 px-4 py-2 font-mono text-[11px] tracking-wide text-ink-soft last:border-b-0"
                            >
                                {item.message}
                            </p>
                        ) : (
                            <ToolRow key={item.key} tool={item} />
                        ),
                    )}
                </div>
            ) : null}
        </div>
    );
}

function ToolRow({ tool }: { tool: TraceTool }) {
    const failed = tool.state.includes('error');
    const interruptPause =
        failed &&
        typeof tool.errorText === 'string' &&
        /"actionRequests"\s*:/.test(tool.errorText);
    const invoking = tool.state === 'input-streaming';
    const running =
        tool.state === 'input-available' ||
        (isLiveState(tool.state) && !invoking && !interruptPause);
    const searchHits = asSearchHits(tool.output);
    const fetchedPages = asFetchedPages(tool.output);
    const summary = failed
        ? tool.errorText ||
          (typeof tool.output === 'string'
              ? tool.output
              : JSON.stringify(tool.output ?? ''))
        : typeof tool.output === 'string'
          ? tool.output
          : tool.output != null
            ? JSON.stringify(tool.output)
            : '';

    return (
        <article className="border-b border-(--rule)/60 px-4 py-2.5 last:border-b-0">
            <div className="flex items-center gap-2">
                <StatusMark
                    invoking={invoking}
                    running={running}
                    failed={failed && !interruptPause}
                    done={tool.state.includes('output') && !failed}
                    approval={tool.state === 'approval-requested'}
                />
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wide text-ink">
                    {displayName(tool.name)}
                    <span className="text-ink-soft">
                        {' · '}
                        {stateLabel(tool, invoking, running, interruptPause)}
                    </span>
                </p>
            </div>
            {tool.input != null && !invoking ? (
                <p className="mt-1.5 pl-5 font-mono text-[12px] text-ink-soft">
                    {formatToolInput(tool.input)}
                </p>
            ) : null}
            {failed && !interruptPause && summary ? (
                <p className="mt-1 pl-5 text-sm text-sienna">
                    {clip(summary, 280)}
                </p>
            ) : tool.output != null && tool.state.includes('output') ? (
                searchHits ? (
                    <SearchHits output={searchHits} />
                ) : fetchedPages ? (
                    <FetchedPages output={fetchedPages} />
                ) : (
                    <pre className="mt-1.5 max-h-16 overflow-auto pl-5 font-mono text-[11px] text-ink">
                        {clip(pretty(tool.output), 480)}
                    </pre>
                )
            ) : null}
            {tool.onHitl ? (
                <div className="mt-2 flex gap-2 pl-5">
                    <button
                        type="button"
                        onClick={() =>
                            tool.onHitl?.({
                                type: 'approve',
                                message: 'Approved',
                            })
                        }
                        className="h-8 rounded-sm bg-sage px-3 font-mono text-[10px] tracking-[0.18em] text-paper uppercase"
                    >
                        Approve
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            tool.onHitl?.({ type: 'reject', message: 'Denied' })
                        }
                        className="h-8 rounded-sm border border-ink px-3 font-mono text-[10px] tracking-[0.18em] uppercase"
                    >
                        Deny
                    </button>
                </div>
            ) : null}
        </article>
    );
}

function StatusMark({
    invoking,
    running,
    failed,
    done,
    approval,
}: {
    invoking: boolean;
    running: boolean;
    failed: boolean;
    done: boolean;
    approval: boolean;
}) {
    const tone = failed
        ? 'border-sienna bg-sienna'
        : approval
          ? 'border-sienna bg-sienna/70'
          : done
            ? 'border-sage bg-sage'
            : running || invoking
              ? 'border-sage bg-transparent'
              : 'border-ink-soft/40 bg-transparent';

    return (
        <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full border ${tone} ${
                invoking || running || approval ? 'animate-pulse' : ''
            }`}
        />
    );
}

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${
                open ? 'rotate-90' : ''
            }`}
        >
            <path d="M6 3.5 11 8l-5 4.5" />
        </svg>
    );
}

function isLiveState(state: string): boolean {
    return (
        state === 'input-streaming' ||
        state === 'input-available' ||
        state === 'approval-requested' ||
        (!state.includes('output') && state !== 'approval-responded')
    );
}

function liveLabel(tool: TraceTool): string {
    if (tool.state === 'input-streaming') {
        return `Invoking ${displayName(tool.name)}…`;
    }
    if (tool.state === 'input-available') {
        return runningLabel(tool.name);
    }
    if (tool.state === 'approval-requested') {
        return `Approve ${displayName(tool.name)}`;
    }
    return runningLabel(tool.name);
}

function runningLabel(name: string): string {
    if (name === 'internet_search') return 'Searching…';
    if (name === 'get_weather') return 'Fetching weather…';
    if (name === 'firecrawl_fetch_url_tool') return 'Reading pages…';
    if (name === 'task') return 'Researching…';
    return `Running ${displayName(name)}…`;
}

function stateLabel(
    tool: TraceTool,
    invoking: boolean,
    running: boolean,
    interruptPause: boolean,
): string {
    if (interruptPause) return runningLabel(tool.name).replace(/…$/, '');
    if (invoking) return 'Invoking';
    if (running) return 'Running';
    if (tool.state === 'approval-requested') return 'Needs approval';
    if (tool.state === 'approval-responded') return 'Responded';
    if (tool.state === 'output-denied') return 'Denied';
    if (tool.state.includes('error')) return 'Error';
    if (tool.state.includes('output')) return 'Done';
    return tool.state;
}

function displayName(name: string): string {
    return name.replace(/_/g, ' ');
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

type FetchedPage = {
    url?: string;
    title?: string;
    markdown?: string;
    error?: string;
};

type FetchOutput = {
    pages: FetchedPage[];
    error?: string;
};

function asFetchedPages(output: unknown): FetchOutput | null {
    if (!output || typeof output !== 'object') return null;
    const rec = output as { pages?: unknown; error?: unknown };
    if (!Array.isArray(rec.pages)) return null;
    return {
        pages: rec.pages.filter(
            (item): item is FetchedPage => !!item && typeof item === 'object',
        ),
        error: typeof rec.error === 'string' ? rec.error : undefined,
    };
}

function asSearchHits(output: unknown): SearchOutput | null {
    if (!output || typeof output !== 'object') return null;
    const rec = output as {
        results?: unknown;
        query?: unknown;
        error?: unknown;
    };
    if (!Array.isArray(rec.results)) return null;
    return {
        query: typeof rec.query === 'string' ? rec.query : undefined,
        results: rec.results.filter(
            (item): item is SearchHit => !!item && typeof item === 'object',
        ),
        error: typeof rec.error === 'string' ? rec.error : undefined,
    };
}

function FetchedPages({ output }: { output: FetchOutput }) {
    return (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-5">
            {output.error ? (
                <p className="text-sm text-sienna">{output.error}</p>
            ) : null}
            {output.pages.map((page, index) => (
                <div key={`${page.url ?? index}`} className="text-sm text-ink">
                    <p className="font-medium">
                        {index + 1}. {page.title || page.url || 'Page'}
                    </p>
                    {page.url ? (
                        <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[11px] text-sage break-all underline-offset-2 hover:underline"
                        >
                            {page.url}
                        </a>
                    ) : null}
                    {page.error ? (
                        <p className="mt-0.5 text-[13px] text-sienna">
                            {page.error}
                        </p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

function SearchHits({ output }: { output: SearchOutput }) {
    return (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-5">
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
    if (input && typeof input === 'object' && 'urls' in input) {
        const urls = (input as { urls?: unknown }).urls;
        if (Array.isArray(urls)) {
            return urls
                .filter((url): url is string => typeof url === 'string')
                .join(', ');
        }
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
