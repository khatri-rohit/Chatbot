'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function UserMessage({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (resetRef.current) clearTimeout(resetRef.current);
        };
    }, []);

    const copy = async () => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (resetRef.current) clearTimeout(resetRef.current);
            resetRef.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard may be blocked */
        }
    };

    return (
        <article className="ml-auto w-fit max-w-[min(100%,22rem)] min-[420px]:max-w-[85%]">
            <p className="mb-1.5 text-right font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase sm:mb-2">
                You
            </p>
            <div className="relative">
                <p className="rounded-sm bg-ink px-3 py-2.5 pr-11 text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap text-paper sm:px-4 sm:py-3 sm:text-base">
                    {text}
                </p>
                <button
                    type="button"
                    onClick={copy}
                    disabled={!text}
                    aria-label={copied ? 'Copied' : 'Copy message'}
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-sm text-paper/55 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:bg-paper/10 focus-visible:text-paper focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none disabled:opacity-30"
                >
                    {copied ? (
                        <Check className="size-3.5" strokeWidth={1.5} aria-hidden />
                    ) : (
                        <Copy className="size-3.5" strokeWidth={1.5} aria-hidden />
                    )}
                </button>
            </div>
        </article>
    );
}
