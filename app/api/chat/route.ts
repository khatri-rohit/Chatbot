import { createDeepAgent } from 'deepagents';
import { NextRequest, NextResponse } from 'next/server';
import { getOllamaModel } from '../../../lib/model';
import { chatRequestSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 1000;

const STREAM_HEADERS = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
};

export async function POST(req: NextRequest) {
    const parsed = chatRequestSchema.safeParse(
        await req.json().catch(() => null),
    );

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Send at least one chat message.' },
            { status: 400 },
        );
    }

    try {
        const agent = await createDeepAgent({
            model: getOllamaModel(),
            systemPrompt:
                'You are a research expert in psychology. Answer in clear Markdown with headings, bold key terms, and short paragraphs.',
        });

        const run = await agent.streamEvents(
            { messages: parsed.data.messages },
            { version: 'v3', signal: req.signal },
        );

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const message of run.messages) {
                        for await (const token of message.text) {
                            if (token) {
                                controller.enqueue(encoder.encode(token));
                            }
                        }
                    }
                    controller.close();
                } catch (error) {
                    if (req.signal.aborted) {
                        controller.close();
                        return;
                    }
                    controller.error(error);
                }
            },
        });

        return new Response(stream, { headers: STREAM_HEADERS });
    } catch (error) {
        console.error('Chat stream failed', error);
        return NextResponse.json(
            { error: 'The assistant could not complete that request.' },
            { status: 500 },
        );
    }
}
