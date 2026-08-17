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
import { getWeather } from "../../../../lib/ai/tools/get-weather";
import z from "zod";

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
        tools: {
          // server-side tool with execute function:
          getWeather: getWeather,

          // client-side tool that starts user interaction:
          askForConfirmation: {
            description: "Ask the user for confirmation.",
            inputSchema: z.object({
              message: z
                .string()
                .describe("The message to ask for confirmation."),
            }),
          },

          // client-side tool that is automatically executed on the client:
          getLocation: {
            description:
              "Get the user location. Always ask for confirmation before using this tool.",
            inputSchema: z.object({}),
          },

          // tools approval
        },
        toolApproval: {
          getWeather: "user-approval",
          askForConfirmation: "approved",
          getLocation: "user-approval",
        },
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
