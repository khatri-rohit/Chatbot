import { MemorySaver } from '@langchain/langgraph';
import { type SubAgent, createDeepAgent } from 'deepagents';
import { handleToolCalls } from '@/lib/ai/middleware';
import { psychologyScope } from '@/lib/ai/middleware/psychology-scope';
import {
    GENERAL_PURPOSE_PROMPT,
    PARENT_SYSTEM_PROMPT,
    RESEARCH_AGENT_PROMPT,
} from '@/lib/ai/prompts';
import { firecrawlFetchUrlTool, webSearch } from '@/lib/ai/tools';
import { getOllamaModel } from '@/lib/model';
import {
    modelCallLimitMiddleware,
    modelFallbackMiddleware,
    modelRetryMiddleware,
    toolCallLimitMiddleware,
    toolRetryMiddleware,
} from 'langchain';

/**
 * Psychology Deep Agent. One MemorySaver for the process; `thread_id` is
 * the checkpoint. Search tools stay on the parent so follow-ups see results.
 *
 * Deep Agents always adds `general-purpose`; we stub it so isolated search
 * cannot steal the thread. Literature briefs go to `research-agent`.
 */
const checkpointer = new MemorySaver();

let agentPromise: ReturnType<typeof createDeepAgent> | null = null;

const parentTools = [webSearch, firecrawlFetchUrlTool];

const generalPurposeSubagent: SubAgent = {
    name: 'general-purpose',
    description:
        'Do not use. Psychology lookups that must stay in this conversation belong on the parent (internet_search, firecrawl_fetch_url_tool). Multi-source literature briefs use research-agent.',
    systemPrompt: GENERAL_PURPOSE_PROMPT,
    middleware: [handleToolCalls],
};

const researchAgent: SubAgent = {
    name: 'research-agent',
    description:
        'Psychology literature brief: rewrite a scholarly search, optionally refine once from hits, read 2–3 pages, return FINDINGS/EVIDENCE/SYNTHESIS/SOURCES/GAPS/FOLLOW_UP. Does not see this chat — description must include QUESTION, SUB_QUESTIONS, CONSTRAINTS, KNOWN_URLS, SUGGESTED_QUERY (rewritten query, not the user sentence). Use for comparisons, evidence reviews, and methods — not greetings or a single lookup.',
    systemPrompt: RESEARCH_AGENT_PROMPT,
    tools: parentTools,
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    middleware: [handleToolCalls],
};

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            name: 'atelier',
            model: getOllamaModel('deepseek-v4-pro:cloud'),
            systemPrompt: PARENT_SYSTEM_PROMPT,
            memory: ['./lib/ai/harness/AGENTS.md'],
            tools: parentTools,
            middleware: [
                psychologyScope,
                handleToolCalls,
                modelRetryMiddleware({ maxRetries: 3 }),
                toolRetryMiddleware({ maxRetries: 3 }),
                modelCallLimitMiddleware({ runLimit: 50 }),
                toolCallLimitMiddleware({ runLimit: 200 }),
                modelFallbackMiddleware('deepseek-v4-pro:0813-cloud'),
            ],
            checkpointer,
            subagents: [generalPurposeSubagent, researchAgent],
        });
    }

    return agentPromise;
}
