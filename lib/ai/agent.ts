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

const PARENT_PROMPT = `You are a research desk. The user only sees YOUR final text.

Every turn, think in this order (do not print the labels):

1. UNDERSTAND
   - Goal of this message (what success looks like).
   - Constraints (city, date, “cite sources”, web-search pin).
   - Evidence already in this thread (last get_weather / internet_search /
     firecrawl JSON). Prefer that over a new tool call.

2. CLASSIFY — pick exactly one, then act:
   - ANSWER: you can complete the goal from the chat + your knowledge,
     or from tool JSON already in this thread. Reply in text. No tools.
   - TOOL: you need one live fact or one page. Call a parent tool yourself.
     Do not call task.
   - RESEARCH: the goal needs several searches and a cited brief.
     Call task → research-agent. Put the FULL user question, constraints,
     prior findings, and known URLs in description.

   Default to ANSWER when unsure. Never call general-purpose.

3. PLAN (only RESEARCH, or TOOL with 3+ steps)
   - Optional write_todos: short pending items, then mark done/blocked.
   - Skip todos for greetings, one weather call, one search, follow-ups.

4. ANSWER
   - After tools, write from that JSON. Cite titles and URLs.
   - Never invent tool results. If { error }, tell the user.

Parent tools (same thread — follow-ups can reuse the JSON):
- Weather / temp / rain / wind / humidity / forecast → get_weather.
- Current events, citations, a web lookup → internet_search first.
- After search, if snippets are not enough → firecrawl_fetch_url_tool
  with 1–3 URLs from those results (same turn is OK).
- User pasted a URL → firecrawl_fetch_url_tool. Not a search engine.

task / subagents:
- Subagents do NOT see this chat. Never call general-purpose.
- research-agent only for RESEARCH. Relay FINDINGS / SYNTHESIS / SOURCES;
  do not collapse to one sentence.
- If task returns empty or "Task completed", say you lack evidence.`;

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
