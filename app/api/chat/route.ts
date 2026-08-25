/**
 * POST /api/chat — AI SDK UI message stream over Deep Agents.
 *
 * Client (`useChat` + DefaultChatTransport):
 *   { id, messages, resume? }  where `id` is the chat/thread id.
 *
 * This route:
 *   1. Validates the body (`lib/schema.ts`)
 *   2. Loads the singleton Deep Agent (`lib/ai/agent.ts`)
 *   3. UIMessage[] → LangChain messages via `toBaseMessages` (@ai-sdk/langchain)
 *      or resumes HITL with LangGraph `Command`
 *   4. `agent.stream({ streamMode: values|messages|tools|custom })`
 *   5. `toUIMessageStream` maps that to UI chunks (text, tool-*, data-progress)
 *   6. After the stream, `getState` → optional `data-hitl` part for Approve/Deny
 *   7. `createUIMessageStreamResponse` sets the UI-message SSE headers `useChat` expects
 */
import { getResearchAgent } from '@/lib/ai/agent';
import { extractHitlData } from '@/lib/ai/hitl';
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

    const { id: threadId, resume } = parsed.data;
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

        const langchainStream = await agent.stream(input, {
            ...config,
            streamMode: ['values', 'messages', 'tools', 'custom'],
        });

        const stream = createUIMessageStream<DeskUIMessage>({
            execute: async ({ writer }) => {
                writer.write({ type: 'start' });

                const uiStream = toUIMessageStream(
                    langchainStream as Parameters<typeof toUIMessageStream>[0],
                    { sendStart: false, sendFinish: false },
                );

                const reader = uiStream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    writer.write(value as InferUIMessageChunk<DeskUIMessage>);
                }

                // HITL: if LangGraph paused (interruptOn), tell the UI.
                const snapshot = await agent.getState(config);
                // console.log(snapshot);
                const hitl = extractHitlData(snapshot, threadId);
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
