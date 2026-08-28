/**
 * POST /api/chat — AI SDK UI message stream over Deep Agents.
 *
 * Client (`useChat` + DefaultChatTransport):
 *   { id, messages, resume?, webSearchEnabled? }
 *
 * `webSearchEnabled` is copied onto LangGraph `configurable` so
 * `internet_search` can run or return a structured "pin off" error.
 * HITL auto-approve remains as a safety net if a nested interrupt appears.
 *
 * New user turns append only the latest HumanMessage when a checkpoint
 * already exists for `id`. HITL resume is always Command({ resume }).
 *
 * LangSmith: each POST is one root run (`atelier-chat-turn`). LangGraph
 * model/tool spans nest under it when LANGSMITH_TRACING=true.
 */
import { getResearchAgent } from '@/lib/ai/agent';
import { extractHitlData } from '@/lib/ai/hitl';
import {
    flushLangSmithTraces,
    getLangchainCallbacks,
    isLangSmithTracingEnabled,
    langSmithProjectName,
    langSmithRunFields,
    runTracedChatTurn,
    scheduleLangSmithTraceFlush,
} from '@/lib/ai/tracing';
import { chatRequestSchema } from '@/lib/schema';
import type { DeskConfigurable, DeskUIMessage, HitlData } from '@/lib/ai/types';
import { Command, type StreamMode } from '@langchain/langgraph';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import {
    createUIMessageStream,
    createUIMessageStreamResponse,
    type InferUIMessageChunk,
    type UIMessage,
} from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FIRST_PIPE_STREAM_MODE = [
    'values',
    'messages',
    'tools',
    'custom',
] as const;
/** Resume re-runs the interrupted node. Skip `values` so checkpoint history is not re-emitted as new tool cards. Keep `tools` so the approved internet_search still appears once. */

type Agent = Awaited<ReturnType<typeof getResearchAgent>>;
type ThreadConfig = {
    configurable: DeskConfigurable;
    signal: AbortSignal;
    runName?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    callbacks?: Awaited<ReturnType<typeof getLangchainCallbacks>>;
};
type UiChunk = InferUIMessageChunk<DeskUIMessage>;

export async function POST(req: Request) {
    const parsed = chatRequestSchema.safeParse(
        await req.json().catch(() => null),
    );

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Send a chat id and at least one UI message.' },
            { status: 400 },
        );
    }

    const { id: threadId, resume, webSearchEnabled } = parsed.data;
    const messages = parsed.data.messages as UIMessage[];

    try {
        scheduleLangSmithTraceFlush();

        const agent = await getResearchAgent();
        const turnMeta = {
            threadId,
            webSearchEnabled: Boolean(webSearchEnabled),
            resume: Boolean(resume),
        };
        const config: ThreadConfig = {
            configurable: {
                thread_id: threadId,
                webSearchEnabled: Boolean(webSearchEnabled),
            },
            signal: req.signal,
            ...langSmithRunFields(turnMeta),
        };

        const input = resume
            ? new Command({ resume: { decisions: resume.decisions } })
            : await humanTurnInput(agent, config, messages, threadId);

        const seenTools = createToolDedupe();

        if (isLangSmithTracingEnabled()) {
            console.info('[langsmith]', {
                project: langSmithProjectName(),
                threadId,
                resume: Boolean(resume),
            });
        }

        const stream = createUIMessageStream<DeskUIMessage>({
            execute: async ({ writer }) => {
                try {
                    writer.write({ type: 'start' });

                    const hitl = await runTracedChatTurn({
                        ...turnMeta,
                        execute: async (): Promise<HitlData | null> => {
                            const callbacks = await getLangchainCallbacks();
                            const tracedConfig: ThreadConfig = callbacks
                                ? { ...config, callbacks }
                                : config;

                            await pipeAgentUi(
                                agent,
                                input,
                                tracedConfig,
                                writer,
                                seenTools,
                                FIRST_PIPE_STREAM_MODE,
                                Boolean(webSearchEnabled),
                            );

                            return extractHitlData(
                                await agent.getState(config, {
                                    subgraphs: true,
                                }),
                                threadId,
                            );
                        },
                    });

                    if (hitl) {
                        writer.write({
                            type: 'data-hitl',
                            id: `hitl-${threadId}`,
                            data: hitl,
                        });
                    }

                    writer.write({ type: 'finish' });
                } finally {
                    await flushLangSmithTraces();
                }
            },
        });

        return createUIMessageStreamResponse({ stream });
    } catch (error) {
        console.error('Chat stream failed', error);
        return NextResponse.json(
            { error: 'The assistant could not complete that request.' },
            { status: 500 },
        );
    }
}

async function humanTurnInput(
    agent: Agent,
    config: ThreadConfig,
    messages: UIMessage[],
    threadId: string,
) {
    const snapshot = await agent.getState(config, { subgraphs: true });
    const checkpointMessages = (
        snapshot as { values?: { messages?: unknown[] } } | null
    )?.values?.messages;
    const hasCheckpoint =
        Array.isArray(checkpointMessages) && checkpointMessages.length > 0;

    console.info('[chat]', {
        threadId,
        webSearchEnabled: Boolean(config.configurable.webSearchEnabled),
        checkpointMessages: Array.isArray(checkpointMessages)
            ? checkpointMessages.length
            : 0,
        input: hasCheckpoint ? 'append-last-user' : 'full-history',
    });

    if (!hasCheckpoint) {
        return { messages: await toBaseMessages(messages) };
    }

    const lastUser = [...messages]
        .reverse()
        .find((message) => message.role === 'user');
    return {
        messages: await toBaseMessages(
            lastUser ? [lastUser] : messages.slice(-1),
        ),
    };
}

function createToolDedupe() {
    const priorIds = new Set<string>();
    const priorPayloads = new Set<string>();

    return {
        beginPipe() {
            return {
                ids: new Set<string>(),
                payloads: new Set<string>(),
            };
        },
        commitPipe(pipe: { ids: Set<string>; payloads: Set<string> }) {
            for (const id of pipe.ids) priorIds.add(id);
            for (const payload of pipe.payloads) priorPayloads.add(payload);
        },
        shouldSkip(
            chunk: UiChunk,
            pipe: { ids: Set<string>; payloads: Set<string> },
        ) {
            if (!isToolUiChunk(chunk)) return false;

            const id =
                'toolCallId' in chunk && typeof chunk.toolCallId === 'string'
                    ? chunk.toolCallId
                    : undefined;
            const payload = toolPayloadKey(chunk);

            const skip =
                (id != null && priorIds.has(id)) ||
                (payload != null && priorPayloads.has(payload));

            if (id) pipe.ids.add(id);
            if (payload) pipe.payloads.add(payload);
            if (skip && id) priorIds.add(id);

            return skip;
        },
    };
}

function isInterruptToolErrorChunk(chunk: UiChunk): boolean {
    if (chunk.type !== 'tool-output-error') return false;
    const text =
        'errorText' in chunk && typeof chunk.errorText === 'string'
            ? chunk.errorText
            : '';
    return (
        /"actionRequests"\s*:/.test(text) ||
        /GraphInterrupt/i.test(text) ||
        /Number of human decisions/i.test(text) ||
        /hanging tool calls/i.test(text)
    );
}

function isToolUiChunk(chunk: UiChunk): boolean {
    return typeof chunk.type === 'string' && chunk.type.startsWith('tool-');
}

function toolPayloadKey(chunk: UiChunk): string | undefined {
    if (
        chunk.type !== 'tool-input-start' &&
        chunk.type !== 'tool-input-available' &&
        chunk.type !== 'tool-input-error'
    ) {
        return undefined;
    }

    const name =
        'toolName' in chunk && typeof chunk.toolName === 'string'
            ? chunk.toolName
            : '';
    if (name !== 'task' && name !== 'internet_search') return undefined;

    const input = 'input' in chunk ? JSON.stringify(chunk.input ?? null) : '';
    return `${name}:${input}`;
}

async function pipeAgentUi(
    agent: Agent,
    input: unknown,
    config: ThreadConfig,
    writer: { write: (chunk: UiChunk) => void },
    seenTools: ReturnType<typeof createToolDedupe>,
    streamMode: readonly StreamMode[],
    hideSearchApproval: boolean,
) {
    const langchainStream = await agent.stream(input, {
        ...config,
        subgraphs: true,
        streamMode: [...streamMode],
    });

    const uiStream = toUIMessageStream(
        langchainStream as Parameters<typeof toUIMessageStream>[0],
        { sendStart: false, sendFinish: false },
    );

    const pipe = seenTools.beginPipe();
    const reader = uiStream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            const chunk = value as UiChunk;
            if (isInterruptToolErrorChunk(chunk)) continue;
            if (hideSearchApproval && chunk.type === 'tool-approval-request') {
                continue;
            }
            if (seenTools.shouldSkip(chunk, pipe)) continue;
            writer.write(chunk);
        }
    } finally {
        seenTools.commitPipe(pipe);
        reader.releaseLock();
    }
}
