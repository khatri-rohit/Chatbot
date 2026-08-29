import { type ToolRuntime, tool } from 'langchain';
import { z } from 'zod';
import { firecrawlFetchUrl, firecrawlSearch } from './firecrawl';

/**
 * Live scholarly web search (Firecrawl). Results stay on the calling
 * agent's message list — register this on the parent so follow-ups still
 * see hits.
 *
 * The Web search pin is `configurable.webSearchEnabled`. Off → structured
 * error, not a throw, so the model can answer from memory instead of crashing.
 */
export const firecrawlFetchUrlTool = tool(
    async (input, config: ToolRuntime) => {
        const urls = input.urls;
        const writer = config.writer;

        if (!isWebSearchEnabled(config)) {
            return {
                pages: [],
                error: 'Web search is off. Enable the Web search pin, or answer from snippets already in this thread. Do not invent URLs.',
            };
        }

        writer?.({
            type: 'progress',
            id: `fetch-${urls.slice(0, 2).join(',')}`,
            message: `Reading ${urls.length} page${urls.length === 1 ? '' : 's'}`,
            step: 'scrape',
        });

        const output = await firecrawlFetchUrl(urls);

        writer?.({
            type: 'progress',
            id: `fetch-${urls.slice(0, 2).join(',')}`,
            message: output.error
                ? 'Could not read those pages'
                : `Read ${output.pages.filter((page) => page.markdown).length} page${output.pages.length === 1 ? '' : 's'}`,
            step: 'done',
        });

        return output;
    },
    {
        name: 'firecrawl_fetch_url_tool',
        description:
            'Read the live page body for specific psychology sources (papers, reviews, methods pages) and return clipped markdown. Use URLs from a previous internet_search in this thread, or URLs the user pasted. After search, call this when snippets are not enough (quotes, measures, samples). Batch up to 3 URLs in one call — do not fetch one-by-one. Do not invent URLs. Do not use this instead of internet_search.',
        schema: z.object({
            urls: z
                .array(z.string())
                .min(1)
                .max(3)
                .describe(
                    'http(s) URLs from internet_search results in this thread, or pasted by the user. Prefer the 2–3 richest scholarly hits in a single call.',
                ),
        }),
    },
);

export const webSearch = tool(
    async (input, config: ToolRuntime) => {
        const query = input.query.trim();
        const writer = config.writer;

        if (!isWebSearchEnabled(config)) {
            return {
                query,
                results: [],
                error: 'Web search is off. Enable the Web search pin, or answer from what you already know in this thread. Do not invent URLs.',
            };
        }

        writer?.({
            type: 'progress',
            id: `search-${query.slice(0, 48)}`,
            message: input.scrape
                ? `Searching and reading pages for “${query}”`
                : `Searching the web for “${query}”`,
            step: 'search',
        });

        const output = await firecrawlSearch(query, { scrape: input.scrape });

        writer?.({
            type: 'progress',
            id: `search-${query.slice(0, 48)}`,
            message: output.error
                ? 'Search finished with no usable results'
                : `Found ${output.results.length} result${output.results.length === 1 ? '' : 's'}`,
            step: 'done',
        });

        return output;
    },
    {
        name: 'internet_search',
        description:
            'Search the live web for psychology research. Returns { query, results: [{ title, url, snippet }] } or { error }. query MUST be a rewritten scholarly search (constructs, authors, years, review, meta-analysis) — never the user’s chat sentence. If the first hit list is thin or off-topic, call again once with a tighter query using authors/terms from those titles. Prefer peer-reviewed and primary sources. Not for weather, news, or general web tasks. Cite the returned URLs. Do not invent sources. Set scrape=true only for a one-shot parent lookup; if you will firecrawl_fetch_url_tool next, leave scrape false.',
        schema: z.object({
            query: z
                .string()
                .describe(
                    'Rewritten scholarly search-box query (not the user question): constructs, authors, years, review/meta-analysis/theory name. Example: working memory Baddeley Hitch review capacity Cowan.',
                ),
            scrape: z
                .boolean()
                .optional()
                .describe(
                    'If true, also fetch short page excerpts. Use only when you will not call firecrawl_fetch_url_tool after. Skip when a later fetch will read full pages.',
                ),
        }),
    },
);

function isWebSearchEnabled(config: ToolRuntime): boolean {
    const nested = config.config?.configurable as
        | { webSearchEnabled?: boolean }
        | undefined;
    const direct = (config as { configurable?: { webSearchEnabled?: boolean } })
        .configurable;
    return Boolean(direct?.webSearchEnabled ?? nested?.webSearchEnabled);
}
