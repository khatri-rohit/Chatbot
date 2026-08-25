import { MemorySaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
import { handleToolCalls } from '@/lib/ai/middleware';
import { getWeather } from '@/lib/ai/tools';
import { getOllamaModel } from '@/lib/model';

/**
 * One Deep Agent + one MemorySaver for the Node process.
 *
 * The chat route (`app/api/chat/route.ts`) looks up this agent, then:
 *   1. Converts AI SDK UIMessages → LangChain messages (`toBaseMessages`)
 *   2. Streams with LangGraph `streamMode` (messages / tools / custom)
 *   3. Converts that stream → UI message chunks (`toUIMessageStream`)
 *
 * `thread_id` from `useChat({ id })` is the checkpoint key. A new
 * MemorySaver per request would make HITL resume impossible.
 *
 * `interruptOn.get_weather` pauses before the tool runs. The route then
 * writes a `data-hitl` part; the UI Approve/Deny button resumes with
 * `Command({ resume })` on the same thread.
 */
const checkpointer = new MemorySaver();

let agentPromise: ReturnType<typeof createDeepAgent> | null = null;

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            model: getOllamaModel(),
            systemPrompt:
                'You are a research expert in psychology who can also report local weather. When a weather tool result is available, use the full object — conditions, feels-like, humidity, wind, precipitation, today/tomorrow highs and lows, sunrise/sunset — not only temperatureC. Answer in clear Markdown with headings, bold key terms, and short paragraphs. Call get_weather for any question about conditions in a place.',
            tools: [getWeather],
            middleware: [handleToolCalls],
            checkpointer,
            interruptOn: {
                get_weather: {
                    allowedDecisions: ['approve', 'reject'],
                },
            },
        });
    }

    return agentPromise;
}
