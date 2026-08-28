/**
 * Canonical origin for metadata, sitemap, and JSON-LD.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://atelier.example.com).
 */
export function getSiteUrl(): URL {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return new URL(explicit);

    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (production) return new URL(`https://${production}`);

    const preview = process.env.VERCEL_URL;
    if (preview) return new URL(`https://${preview}`);

    return new URL('http://localhost:3000');
}

export const siteConfig = {
    name: 'Atelier',
    shortName: 'Atelier',
    tagline: 'Psychology research desk',
    description:
        'A streaming research assistant for psychology. Ask about emotion, memory, cognition, and related findings — answers render live in Markdown, with optional weather and web search in the same thread.',
    locale: 'en_US',
    keywords: [
        'psychology research assistant',
        'AI research desk',
        'psychology chatbot',
        'cognitive science',
        'emotion and memory',
        'streaming Markdown assistant',
    ],
} as const;

export function jsonLdGraph() {
    const origin = getSiteUrl().origin;

    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${origin}/#website`,
                url: origin,
                name: siteConfig.name,
                description: siteConfig.description,
                inLanguage: 'en',
            },
            {
                '@type': 'WebApplication',
                '@id': `${origin}/#app`,
                name: siteConfig.name,
                url: origin,
                description: siteConfig.description,
                applicationCategory: 'EducationalApplication',
                operatingSystem: 'Any',
                inLanguage: 'en',
                offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'USD',
                },
            },
        ],
    };
}
