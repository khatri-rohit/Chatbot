'use client';

import { ChevronDown } from 'lucide-react';

export default function GeneratingMark({
    busy,
    canJump,
    waiting,
    onJump,
}: {
    busy: boolean;
    canJump: boolean;
    waiting: boolean;
    onJump: () => void;
}) {
    if (!busy && !canJump) return null;

    const label = canJump
        ? busy
            ? 'Generating a reply. Scroll to latest'
            : 'Scroll to latest'
        : 'Generating a reply';

    const mark = (
        <span
            className={`flex size-10 items-center justify-center rounded-full border border-dashed border-sage/50 bg-paper/90 text-sage shadow-[0_8px_24px_rgba(36,24,15,0.08)] ${
                busy ? 'animate-desk-nudge' : ''
            }`}
        >
            <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
    );

    if (canJump) {
        return (
            <button
                type="button"
                aria-label={label}
                aria-busy={busy}
                onClick={onJump}
                className="flex flex-col items-center gap-1.5 rounded-full focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none"
            >
                {mark}
                {busy && waiting ? (
                    <span className="font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                        Working
                    </span>
                ) : null}
            </button>
        );
    }

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={label}
            className="flex flex-col items-center gap-1.5"
        >
            {mark}
            {waiting ? (
                <span className="font-mono text-[10px] tracking-[0.22em] text-sage uppercase">
                    Working
                </span>
            ) : (
                <span className="sr-only">Generating a reply</span>
            )}
        </div>
    );
}
