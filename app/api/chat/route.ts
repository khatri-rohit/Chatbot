import { createDeepAgent } from 'deepagents';
import { NextRequest, NextResponse } from 'next/server';
import { getOllamaModel } from '../../../lib/model';
import { HumanMessage } from 'langchain';
import { SystemMessage, convertToChunk } from '@langchain/core/messages';

export async function POST(req: NextRequest) {
    try {
        const { query } = await req.json();
        const model = getOllamaModel();

        const agent = await createDeepAgent({
            model,
            systemPrompt: 'You are research expert in pshycology.',
        });

        const messages = [
            new SystemMessage('You are a research expreiecne'),
            new HumanMessage(query),
        ];

        // // Invoke agent for output without stream
        // const result = await agent.invoke({ messages });
        // for (const chunk of result) {
        //     const msg = convertToChunk(chunk);
        //     console.log(msg.content);
        // }

        const result = await agent.streamEvents({ messages });

        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result) {
                    if (chunk.event === 'on_chat_model_stream') {
                        controller.enqueue(chunk.data.chunk.content);
                    }
                }
                controller.close();
            },
        });

        // return new Response(stream, {
        //     headers: { 'Content-Type': 'text/event-stream' },
        // });
        return new NextResponse(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    } catch (err) {
        const error = err;
        console.log(error);
        return NextResponse.json({
            success: false,
            data: error,
        });
    }
}
