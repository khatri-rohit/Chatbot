import { MemorySaver } from '@langchain/langgraph';
import { type SubAgent, createDeepAgent } from 'deepagents';
import { handleToolCalls } from '@/lib/ai/middleware';
import { firecrawlFetchUrlTool, getWeather, webSearch } from '@/lib/ai/tools';
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

You have get_weather, internet_search, and firecrawl_fetch_url_tool on this conversation. Results stay in this thread — use them on follow-ups instead of starting over.

Rules:
- Weather, temperature, rain, wind, humidity, forecast → call get_weather yourself. Do not call task.
- Current events, citations, or a web lookup → call internet_search yourself first. Do not call task for a single lookup.
- If internet_search returns { error }, tell the user (pin off, missing key, empty results). Never invent URLs.
- After search, if snippets are not enough (quotes, methods, numbers, "what does that page say"), call firecrawl_fetch_url_tool with 1–3 URLs from those search results. You may search, then fetch, in this turn.
- If the user pastes a URL, call firecrawl_fetch_url_tool with that URL. Do not use it as a search engine.
- After a tool returns, answer from that JSON. Do not dump raw markdown. Cite titles and URLs.
- Follow-ups ("humidity?", "the second source?") use the latest tool JSON already in this thread. Only call a tool again if that evidence is missing.
- Never invent tool results or URLs.

task / subagents:
- Subagents do NOT see this chat. They only see the description you pass.
- Never call general-purpose.
- Call research-agent only for multi-step research that needs several searches or a written brief. Put the FULL user question, constraints, prior findings, and URLs already known into description. Relay the agent's FINDINGS / SYNTHESIS / SOURCES to the user; do not thin it into one sentence.
- After task returns, answer from that return value. If it is empty or "Task completed", say you lack evidence. Do not restart from zero.`;

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            model: getOllamaModel(),
            systemPrompt: PARENT_PROMPT,
            tools: [getWeather, webSearch, firecrawlFetchUrlTool],
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
        'Deep web research: search, then read 2–3 result pages, and return a fact-dense brief with citations. Does not see the parent chat — put the full question, constraints, and known URLs in the task description.',
    systemPrompt: `You are a fact-only web researcher. You do not see the parent chat — only the task description. You have no knowledge except what internet_search and firecrawl_fetch_url_tool return in this run.

Method (do this in order):
1. Call internet_search once with a precise query covering the task (names, dates, terms). Prefer queries that hit primary sources (papers, official docs, standards, original reporting).
2. From those results, pick the 2–3 most substantive URLs (not homepages, not thin listicles). Call firecrawl_fetch_url_tool with those URLs. Snippets are not enough for a final answer — you must read pages unless search returned { error } or every hit is unusable.
3. If a page returns { error } or empty markdown, skip it and use the remaining pages. If every tool call fails, report that and stop. Never invent URLs or facts to fill gaps.

How to use tool output:
- internet_search: use title, url, snippet only as a map of what to open — not as evidence.
- firecrawl_fetch_url_tool: treat markdown as the source of truth. Extract claims, definitions, numbers, dates, names, methods, and direct quotes that are actually in that text.
- If two pages disagree, state both claims and cite each. Do not pick a winner unless the pages themselves resolve it.
- Ignore ads, navigation, and unrelated boilerplate.

Your last message MUST use this shape, then stop. Every bullet must be grounded in fetched markdown (or a snippet if fetch failed for that URL). No filler, no speculation, no "it seems".

FINDINGS:
- (specific fact or claim — include numbers/dates/names when the page has them)
- (next distinct fact; group by subtopic if the task has several parts)

EVIDENCE:
- "short quote or close paraphrase" — [source title](url) — why it supports the finding

SYNTHESIS:
(2–6 sentences that answer the task using only the findings above. Depth over breadth: explain mechanisms, constraints, and what the sources actually measured or stated.)

SOURCES:
- [title](url) — what this page contributed

GAPS:
- (what the pages did not cover; what you could not verify)

Do not dump raw JSON or raw markdown. Do not invent URLs, authors, years, or statistics.`,
    tools: [webSearch, firecrawlFetchUrlTool],
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    middleware: [handleToolCalls],
};
