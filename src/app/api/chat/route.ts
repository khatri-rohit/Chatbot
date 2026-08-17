import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  createUIMessageStream,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { NextRequest } from "next/server";
import { initializeOllama } from "../../../../lib/models";
import { getWeather } from "../../../../lib/ai/tools/get-weather";

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
        stopWhen: isStepCount(5),
        tools: {
          getWeather,
        },
        toolApproval: {
          getWeather: "user-approval",
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream }));
    },
    onEnd: () => {
      // persist messages here
    },
  });

  return createUIMessageStreamResponse({ stream });
}
