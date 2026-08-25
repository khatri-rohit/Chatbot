import type { Metadata } from 'next';
import { Fraunces, Source_Serif_4, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Fraunces({
    variable: '--font-display',
    subsets: ['latin'],
    axes: ['SOFT', 'WONK', 'opsz'],
});

const serif = Source_Serif_4({
    variable: '--font-serif',
    subsets: ['latin'],
});

const mono = IBM_Plex_Mono({
    variable: '--font-mono',
    subsets: ['latin'],
    weight: ['400', '500'],
});

export const metadata: Metadata = {
    title: 'Atelier — Psychology research desk',
    description: 'A streaming research assistant for psychology.',
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
