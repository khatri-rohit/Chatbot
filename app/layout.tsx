import { getSiteUrl, siteConfig } from '@/lib/site';
import type { Metadata, Viewport } from 'next';
import { Fraunces, Source_Serif_4, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Fraunces({
    variable: '--font-display',
    subsets: ['latin'],
    axes: ['SOFT', 'WONK', 'opsz'],
    display: 'swap',
});

const serif = Source_Serif_4({
    variable: '--font-serif',
    subsets: ['latin'],
    display: 'swap',
});

const mono = IBM_Plex_Mono({
    variable: '--font-mono',
    subsets: ['latin'],
    weight: ['400', '500'],
    display: 'swap',
});

const site = getSiteUrl();

export const metadata: Metadata = {
    metadataBase: site,
    title: {
        default: `${siteConfig.name} — ${siteConfig.tagline}`,
        template: `%s · ${siteConfig.name}`,
    },
    description: siteConfig.description,
    applicationName: siteConfig.name,
    keywords: [...siteConfig.keywords],
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    category: 'education',
    alternates: {
        canonical: '/',
    },
    icons: {
        icon: [{ url: '/favicon.ico' }, { url: '/apple-icon.png' }],
        apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
    },
    openGraph: {
        type: 'website',
        locale: siteConfig.locale,
        url: site,
        siteName: siteConfig.name,
        title: `${siteConfig.name} — ${siteConfig.tagline}`,
        description: siteConfig.description,
    },
    twitter: {
        card: 'summary_large_image',
        title: `${siteConfig.name} — ${siteConfig.tagline}`,
        description: siteConfig.description,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
        },
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#efe4d0',
    colorScheme: 'light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html
            lang="en"
            className={`${display.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
