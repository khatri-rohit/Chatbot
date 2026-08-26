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
                'You are a psychology research desk coordinator. You have no weather or web-search tools. For weather, call task with subagent_type: "weather-agent". For web research, call task with subagent_type: "research-agent". Never invent tool results. After a subagent returns, answer the user from that summary.',
            middleware: [handleToolCalls],
            checkpointer,
            subagents: [researchAgent, weatherAgent],
            // tools: [webSearch, getWeather],
        });
    }

    return agentPromise;
}

const researchAgent: SubAgent = {
    name: 'research-agent',
    description:
        'Research a topic on the web with internet_search. Use for current events, citations, or questions that need the internet.',
    systemPrompt: `You research with internet_search.
  Break the question into queries, search, then return:
  - 2–3 paragraph summary
  - key findings
  - sources with URLs
  Keep under ~400 words. Do not paste raw search payloads.`,
    tools: [webSearch],
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    middleware: [handleToolCalls],
    interruptOn: {
        internet_search: { allowedDecisions: ['approve', 'reject'] },
    },
};

const weatherAgent: SubAgent = {
    name: 'weather-agent',
    description:
        'Fetch current weather and a short forecast for a city. Use for any weather, temperature, rain, wind, or humidity question.',
    systemPrompt: `You look up weather with get_weather.
  Call the tool. Return a short summary: location, conditions, temperature, feels-like, wind, humidity, today/tomorrow highs.
  Do not dump raw JSON. Do not answer without calling the tool.`,
    tools: [getWeather],
    middleware: [handleToolCalls],
    interruptOn: {
        get_weather: { allowedDecisions: ['approve', 'reject'] },
    },
};
