import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  createUIMessageStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { NextRequest } from "next/server";
import { initializeOllama } from "../../../../lib/models";

export const maxDuration = 30;
export async function POST(req: NextRequest) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const ollama = initializeOllama();
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      writer.write({ type: "data-status", data: { phase: "thinking" } });

      const result = streamText({
        model: ollama("gemma4:cloud"),
        messages: await convertToModelMessages(messages),
      });

      writer.merge(toUIMessageStream({ stream: result.stream }));
    },
    onEnd: ({ messages }) => {
      // persist messages here
    },
  });

  return createUIMessageStreamResponse({ stream });
  // return createUIMessageStreamResponse({
  //   stream: toUIMessageStream({
  //     stream: result.stream,
  //     sendReasoning: true, // only if the model actually emits reasoning
  //   }),
  // });
}
