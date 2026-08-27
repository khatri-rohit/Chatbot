import { MemorySaver } from '@langchain/langgraph';
import { type SubAgent, createDeepAgent } from 'deepagents';
import { handleToolCalls } from '@/lib/ai/middleware';
import { getWeather, webSearch } from '@/lib/ai/tools';
import { getOllamaModel } from '@/lib/model';
import {
    modelCallLimitMiddleware,
    modelFallbackMiddleware,
    modelRetryMiddleware,
    toolCallLimitMiddleware,
    toolRetryMiddleware,
} from 'langchain';

/**
 * One Deep Agent + one MemorySaver for the Node process.
 *
 * The chat route (`app/api/chat/route.ts`) looks up this agent, then:
 *   1. Appends only the new HumanMessage when a checkpoint exists
 *   2. Streams with LangGraph `streamMode` (messages / tools / custom)
 *   3. Converts that stream → UI message chunks (`toUIMessageStream`)
 *
 * `thread_id` from `useChat({ id })` is the checkpoint key. A new
 * MemorySaver per request would make HITL resume impossible.
 *
 * HITL is only on research-agent `internet_search`. The parent never
 * approves search; it calls `task`. After a subagent returns, it answers
 * from that summary.
 */
const checkpointer = new MemorySaver();

let agentPromise: ReturnType<typeof createDeepAgent> | null = null;

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            model: getOllamaModel(),
            systemPrompt: `You are a psychology research desk coordinator. You have no weather or web-search tools of your own.

For weather, call task once with subagent_type: "weather-agent".
For web research, call task once with subagent_type: "research-agent".

Call task at most once per user question. Never invent tool results.
After a subagent returns a summary, answer the user from that summary. Do not call task again for the same question unless the subagent explicitly failed with a real tool error. Do not start the research from zero after a subagent returns.`,
            middleware: [
                handleToolCalls,
                modelRetryMiddleware({ maxRetries: 3 }),
                toolRetryMiddleware({ maxRetries: 3 }),
                modelCallLimitMiddleware({ runLimit: 50 }),
                toolCallLimitMiddleware({ runLimit: 200 }),
                modelFallbackMiddleware('deepseek-v4-pro:0813-cloud'),
            ],
            checkpointer,
            subagents: [researchAgent, weatherAgent],
        });
    }

    return agentPromise;
}

const researchAgent: SubAgent = {
    name: 'research-agent',
    description:
        'Research a topic on the web with internet_search. Use for current events, citations, or questions that need the internet.',
    systemPrompt: `You research psychology topics on the web with internet_search.

Use one internet_search call with a focused query. If that result is clearly insufficient, you may make at most one follow-up search. Do not break the question into many queries. Do not run searches in parallel.

Return one short summary with sources, then stop.`,
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
    // interruptOn: {
    //     get_weather: { allowedDecisions: ['approve', 'reject'] },
    // },
};
