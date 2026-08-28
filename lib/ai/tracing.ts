import { after } from 'next/server';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { Client } from 'langsmith';
import { getLangchainCallbacks } from 'langsmith/langchain';
import { traceable } from 'langsmith/traceable';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export type ChatTurnTraceInput = {
    threadId: string;
    webSearchEnabled: boolean;
    resume: boolean;
};

function envFlag(name: string) {
    return TRUTHY.has((process.env[name] ?? '').trim().toLowerCase());
}

/**
 * LangSmith records a run when tracing is on and an API key is present.
 * Accepts both LANGSMITH_TRACING and the older LANGCHAIN_TRACING_V2 name.
 */
export function isLangSmithTracingEnabled() {
    return (
        (envFlag('LANGSMITH_TRACING') ||
            envFlag('LANGCHAIN_TRACING_V2') ||
            envFlag('LANGSMITH_TRACING_V2')) &&
        Boolean(
            process.env.LANGSMITH_API_KEY?.trim() ||
                process.env.LANGCHAIN_API_KEY?.trim(),
        )
    );
}

export function langSmithProjectName() {
    return (
        process.env.LANGSMITH_PROJECT?.trim() ||
        process.env.LANGCHAIN_PROJECT?.trim() ||
        'default'
    );
}

let client: Client | undefined;

export function getLangSmithClient() {
    client ??= new Client();
    return client;
}

/** Tags + metadata copied onto the LangGraph `stream()` RunnableConfig. */
export function langSmithRunFields(meta: ChatTurnTraceInput) {
    return {
        runName: meta.resume ? 'atelier-resume' : 'atelier-chat',
        tags: [
            'atelier',
            'psychology-desk',
            meta.resume ? 'hitl-resume' : 'user-turn',
            meta.webSearchEnabled ? 'web-search-on' : 'web-search-off',
        ],
        metadata: {
            thread_id: meta.threadId,
            webSearchEnabled: meta.webSearchEnabled,
            resume: meta.resume,
            project: langSmithProjectName(),
        },
    };
}

export async function flushLangSmithTraces() {
    if (!isLangSmithTracingEnabled()) return;
    await Promise.all([
        getLangSmithClient().awaitPendingTraceBatches(),
        awaitAllCallbacks(),
    ]);
}

/** Keep the serverless/Node process alive until batches reach LangSmith. */
export function scheduleLangSmithTraceFlush() {
    if (!isLangSmithTracingEnabled()) return;
    after(() => flushLangSmithTraces());
}

/**
 * One LangSmith root run per HTTP chat turn. LangGraph LLM/tool spans nest
 * under this when `getLangchainCallbacks()` is passed into `agent.stream()`.
 */
const tracedChatTurn = traceable(
    async function tracedChatTurn(
        params: ChatTurnTraceInput & { execute: () => Promise<unknown> },
    ) {
        return params.execute();
    },
    {
        name: 'atelier-chat-turn',
        run_type: 'chain',
        processInputs: (inputs) => ({
            threadId: (inputs as ChatTurnTraceInput).threadId,
            webSearchEnabled: (inputs as ChatTurnTraceInput).webSearchEnabled,
            resume: (inputs as ChatTurnTraceInput).resume,
        }),
    },
);

export async function runTracedChatTurn<T>(
    params: ChatTurnTraceInput & { execute: () => Promise<T> },
): Promise<T> {
    return tracedChatTurn(params) as Promise<T>;
}

export { getLangchainCallbacks };
