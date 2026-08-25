import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({
    apiKey: process.env.FIRECRAWL_API_KEY ?? '',
});

export async function firecrawlSearch(query: string) {
    const results = await firecrawl.search(query, {
        limit: 5,
    });
    return results;
}
