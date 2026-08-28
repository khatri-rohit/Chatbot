import { getSiteUrl } from '@/lib/site';
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const origin = getSiteUrl().origin;

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/api/'],
            },
        ],
        sitemap: `${origin}/sitemap.xml`,
        host: origin,
    };
}
