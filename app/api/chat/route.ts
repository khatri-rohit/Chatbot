/**
 * POST /api/chat — stream Deep Agent output as AI SDK UI messages.
 *
 * Body: `{ id, messages, resume?, webSearchEnabled? }`
 * `id` is the LangGraph thread. Existing threads append only the last user turn.
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

const STREAM_MODE: StreamMode[] = ['values', 'messages', 'tools', 'custom'];

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

function isInterruptToolError(chunk: UiChunk): boolean {
    if (chunk.type !== 'tool-output-error') return false;
    const text =
        'errorText' in chunk && typeof chunk.errorText === 'string'
            ? chunk.errorText
            : '';
    return (
        /actionRequests|GraphInterrupt|human decisions|hanging tool calls/i.test(
            text,
        )
    );
}

async function pipeAgentUi(
    agent: Agent,
    input: unknown,
    config: ThreadConfig,
    writer: { write: (chunk: UiChunk) => void },
    hideSearchApproval: boolean,
) {
    const langchainStream = await agent.stream(input, {
        ...config,
        subgraphs: true,
        streamMode: STREAM_MODE,
    });

    const uiStream = toUIMessageStream(
        langchainStream as Parameters<typeof toUIMessageStream>[0],
        { sendStart: false, sendFinish: false },
    );

    const reader = uiStream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            const chunk = value as UiChunk;
            if (isInterruptToolError(chunk)) continue;
            if (hideSearchApproval && chunk.type === 'tool-approval-request') {
                continue;
            }
            writer.write(chunk);
        }
    } finally {
        reader.releaseLock();
    }
}
