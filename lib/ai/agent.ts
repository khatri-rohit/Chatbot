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
 * Psychology Deep Agent + one MemorySaver for the Node process.
 *
 * Search and page reads live on the PARENT so tool JSON stays in the
 * same checkpointed message list. Subagents are handoff-isolated: they
 * only see `task.description`, never the chat.
 *
 * Deep Agents auto-inserts `general-purpose` (inherits parent tools).
 * We override that name so isolated search cannot steal the thread.
 * Literature briefs go to `research-agent`.
 *
 * Identity/scope: `memory` loads `lib/ai/harness/AGENTS.md` into the
 * system prompt. `psychologyScope` is the LangChain guardrail
 * (beforeAgent jumpTo end) so coding/weather turns never hit the model.
 *
 * `thread_id` from `useChat({ id })` is the checkpoint key.
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
        'Psychology literature brief: scholarly search, then read 2–3 result pages, and return a fact-dense brief with citations. Does not see the parent chat — put the full question, constraints, and known URLs in the task description. Use for theory comparisons, evidence reviews, and methods — not for greetings or a single lookup.',
    systemPrompt: RESEARCH_AGENT_PROMPT,
    tools: [...parentTools],
    model: getOllamaModel('deepseek-v4-flash:cloud'),
    middleware: [handleToolCalls],
};

const subagents = [generalPurposeSubagent, researchAgent];

export function getResearchAgent() {
    if (!agentPromise) {
        agentPromise = createDeepAgent({
            name: 'atelier',
            model: getOllamaModel(),
            systemPrompt: PARENT_SYSTEM_PROMPT,
            memory: ['./lib/ai/harness/AGENTS.md'],
            tools: [...parentTools],
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
            subagents: [...subagents],
        });
    }

    return agentPromise;
}
