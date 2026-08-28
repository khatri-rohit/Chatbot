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
 * Weather and web search live on the PARENT so tool results stay in the
 * same checkpointed message list (the Vercel chatbot pattern). Subagents
 * are handoff-isolated: they only see `task.description`, never the chat.
 *
 * Deep Agents auto-inserts a `general-purpose` subagent that inherits
 * parent tools. We occupy that name with a stub so it cannot steal search
 * into an empty context window.
 *
 * `thread_id` from `useChat({ id })` is the checkpoint key.
 */
const checkpointer = new MemorySaver();

let agentPromise: ReturnType<typeof createDeepAgent> | null = null;

const PARENT_PROMPT = `You are a research desk coordinator. The user only sees YOUR final text.

You have get_weather and internet_search on this conversation. Results stay in this thread — use them on follow-ups instead of starting over.

Rules:
- Weather, temperature, rain, wind, humidity, forecast → call get_weather yourself. Do not call task.
- Current events, citations, or anything that needs the live web → call internet_search yourself. Do not call task for a single lookup.
- If internet_search returns { error }, tell the user (pin off, missing key, empty results). Never invent URLs.
- After a tool returns, answer from that JSON. Do not dump raw JSON. Cite source titles and URLs from search results.
- Follow-ups ("humidity?", "the second source?") use the latest tool JSON already in this thread. Only call a tool again if that evidence is missing.
- Call at most one tool per step. Never invent tool results.

task / subagents:
- Subagents do NOT see this chat. They only see the description you pass.
- Never call general-purpose.
- Call research-agent only for multi-step research that needs several searches or a written brief. Put the FULL user question, constraints, prior findings, and URLs already known into description. Ask it to return: summary, evidence bullets, markdown source list.
- After task returns, answer from that return value. If it is empty or "Task completed", say you lack evidence. Do not restart from zero.`;

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            model: getOllamaModel(),
            systemPrompt: PARENT_PROMPT,
            tools: [getWeather, webSearch],
            middleware: [
                handleToolCalls,
                modelRetryMiddleware({ maxRetries: 3 }),
                toolRetryMiddleware({ maxRetries: 3 }),
                modelCallLimitMiddleware({ runLimit: 50 }),
                toolCallLimitMiddleware({ runLimit: 200 }),
                modelFallbackMiddleware('deepseek-v4-pro:0813-cloud'),
            ],
            checkpointer,
            subagents: [blockedGeneralPurpose, researchAgent],
        });
    }

    return agentPromise;
}

/** Occupies Deep Agents' auto-added name so it cannot inherit parent tools in isolation. */
const blockedGeneralPurpose: SubAgent = {
    name: 'general-purpose',
    description:
        'Do not use. The parent already has get_weather and internet_search. Invoking this agent drops the conversation.',
    systemPrompt:
        'You should not have been invoked. Reply that the parent should use get_weather or internet_search, then stop.',
    tools: [],
    middleware: [handleToolCalls],
};

const researchAgent: SubAgent = {
    name: 'research-agent',
    description:
        'Multi-step web research only (several queries or a written brief). For a single lookup the parent must call internet_search itself. This agent does not see the chat — the parent must put the full question, prior findings, and URLs in the task description.',
    systemPrompt: `You research on the web with internet_search. You do not see the parent chat — only the task description.

Use one focused internet_search call. If that result is clearly insufficient, you may make at most one follow-up search. Do not run searches in parallel. If the tool returns { error }, report that error and stop.

Your last message MUST use this shape, then stop:
SUMMARY: (short answer)
EVIDENCE:
- (fact, with source title)
SOURCES:
- [title](url) — snippet
LIMITATIONS: (what you could not verify)

Do not dump raw JSON. Do not invent URLs.`,
    tools: [webSearch],
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    middleware: [handleToolCalls],
};
