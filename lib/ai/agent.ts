import { MemorySaver } from '@langchain/langgraph';
import { type SubAgent, createDeepAgent } from 'deepagents';
import { handleToolCalls } from '@/lib/ai/middleware';
import { getWeather, webSearch } from '@/lib/ai/tools';
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
                'You are a research expert in psychology and you can use the tools to research more in depth questions weather related questions or internet related questions you can use the subagents to research more in depth questions',
            middleware: [handleToolCalls],
            checkpointer,
            // subagents: getSubagents().subagents,
            tools: [webSearch, getWeather],
            interruptOn: {
                get_weather: {
                    allowedDecisions: ['approve', 'reject'],
                },
                internet_search: {
                    allowedDecisions: ['approve', 'reject'],
                },
            },
        });
    }

    return agentPromise;
}

const researchSubagent: SubAgent = {
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    name: 'research-agent',
    description: 'Used to research more in depth questions',
    systemPrompt: 'You are a great researcher',
    tools: [webSearch, getWeather],
    interruptOn: {
        get_weather: {
            allowedDecisions: ['approve', 'reject'],
        },
        internet_search: {
            allowedDecisions: ['approve', 'reject'],
        },
    },
};
const subagents = [researchSubagent];

export function getSubagents() {
    return {
        subagents,
    };
}
