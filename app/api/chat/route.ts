/**
 * POST /api/chat — AI SDK UI message stream over Deep Agents.
 *
 * Client (`useChat` + DefaultChatTransport):
 *   { id, messages, resume?, webSearchEnabled? }
 *
 * HITL lives on the LangGraph thread (research-agent.internet_search),
 * not on the chat UI. The pin is a request flag: when web search is on,
 * this route resumes search interrupts with approve decisions in the
 * same HTTP stream instead of asking the client to regenerate().
 */
import { getResearchAgent } from '@/lib/ai/agent';
import {
    extractHitlData,
    isAutoApprovableWebSearch,
    webSearchApproveDecisions,
} from '@/lib/ai/hitl';
import { chatRequestSchema } from '@/lib/schema';
import type { DeskUIMessage } from '@/lib/ai/types';
import { Command } from '@langchain/langgraph';
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
export const maxDuration = 1000;

const MAX_AUTO_APPROVE_TURNS = 8;

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
        const agent = await getResearchAgent();
        const config = {
            configurable: { thread_id: threadId },
            signal: req.signal,
        };

        const input = resume
            ? new Command({ resume: { decisions: resume.decisions } })
            : { messages: await toBaseMessages(messages) };

        const stream = createUIMessageStream<DeskUIMessage>({
            execute: async ({ writer }) => {
                writer.write({ type: 'start' });

                await pipeAgentUi(agent, input, config, writer);

                let hitl = extractHitlData(
                    await agent.getState(config),
                    threadId,
                );

                for (
                    let turn = 0;
                    webSearchEnabled &&
                    hitl &&
                    isAutoApprovableWebSearch(hitl) &&
                    turn < MAX_AUTO_APPROVE_TURNS;
                    turn++
                ) {
                    await pipeAgentUi(
                        agent,
                        new Command({
                            resume: {
                                decisions: webSearchApproveDecisions(
                                    hitl.pendingCount,
                                ),
                            },
                        }),
                        config,
                        writer,
                    );
                    hitl = extractHitlData(
                        await agent.getState(config),
                        threadId,
                    );
                }

                if (hitl) {
                    writer.write({
                        type: 'data-hitl',
                        id: `hitl-${threadId}`,
                        data: hitl,
                    });
                }

                writer.write({ type: 'finish' });
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

async function pipeAgentUi(
    agent: Awaited<ReturnType<typeof getResearchAgent>>,
    input: unknown,
    config: { configurable: { thread_id: string }; signal: AbortSignal },
    writer: { write: (chunk: InferUIMessageChunk<DeskUIMessage>) => void },
) {
    const langchainStream = await agent.stream(input, {
        ...config,
        streamMode: ['values', 'messages', 'tools', 'custom'],
    });

    const uiStream = toUIMessageStream(
        langchainStream as Parameters<typeof toUIMessageStream>[0],
        { sendStart: false, sendFinish: false },
    );

    const reader = uiStream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            writer.write(value as InferUIMessageChunk<DeskUIMessage>);
        }
    }
}
