import { Firecrawl } from 'firecrawl';

const SNIPPET_MAX = 280;
const EXCERPT_MAX = 1800;
const SEARCH_LIMIT = 5;

const firecrawl = new Firecrawl({
    apiKey: process.env.FIRECRAWL_API_KEY ?? '',
});

export type WebSearchHit = {
    title: string;
    url: string;
    snippet: string;
    excerpt?: string;
};

export type WebSearchOutput = {
    query: string;
    results: WebSearchHit[];
    error?: string;
};

export async function firecrawlFetchUrl(urls: string[]): Promise<string> {
    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) {
        throw new Error(
            'Search is not configured. FIRECRAWL_API_KEY is missing.',
        );
    }

    const job = await firecrawl.batchScrape(
        urls.length > 0
            ? urls
            : ['https://firecrawl.dev', 'https://docs.firecrawl.dev'],
        { options: { formats: ['markdown'] }, pollInterval: 2, timeout: 500 },
    );
    console.log(job.data);
    return job.data.map((result) => result.markdown).join('\n');
}

/**
 * Firecrawl SERP → compact JSON the model can cite.
 *
 * Raw SDK objects (and full page markdown) blow small-model context and
 * make answers unpredictable. Snippets are the default; `scrape` adds a
 * short excerpt on hits that include page body.
 */
export async function firecrawlSearch(
    query: string,
    options?: { scrape?: boolean },
): Promise<WebSearchOutput> {
    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) {
        return {
            query,
            results: [],
            error: 'Search is not configured. FIRECRAWL_API_KEY is missing.',
        };
    }

    try {
        console.log('query firecrawlSearch', query);
        const data = await firecrawl.search(query, {
            limit: SEARCH_LIMIT,
            ...(options?.scrape
                ? { scrapeOptions: { formats: ['markdown' as const] } }
                : {}),
        });
        console.log('data firecrawlSearch', data);
        const results = (data.web ?? [])
            .map(normalizeHit)
            .filter((hit): hit is WebSearchHit => hit != null);

        if (results.length === 0) {
            return {
                query,
                results: [],
                error: 'No web results for that query. Try a more specific search.',
            };
        }

        return { query, results };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            query,
            results: [],
            error: `Search failed: ${message}`,
        };
    }
}

function normalizeHit(item: unknown): WebSearchHit | null {
    if (!item || typeof item !== 'object') return null;

    const rec = item as Record<string, unknown>;
    const metadata =
        rec.metadata && typeof rec.metadata === 'object'
            ? (rec.metadata as Record<string, unknown>)
            : {};

    const url = firstString(
        rec.url,
        metadata.sourceURL,
        metadata.url,
        metadata.ogUrl,
    );
    if (!url) return null;

    const title =
        firstString(rec.title, metadata.title, metadata.ogTitle) || url;
    const snippet = firstString(
        rec.description,
        rec.snippet,
        rec.summary,
        metadata.description,
        metadata.ogDescription,
    );
    const markdown =
        typeof rec.markdown === 'string' ? rec.markdown.trim() : '';

    return {
        title,
        url,
        snippet: clip(snippet || markdown, SNIPPET_MAX),
        ...(markdown ? { excerpt: clip(markdown, EXCERPT_MAX) } : {}),
    };
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function clip(text: string, max: number): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max)}…`;
}
