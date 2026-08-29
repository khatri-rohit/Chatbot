import type { ReactNode } from 'react';

export default function DeskMasthead({
    compact = false,
    busy,
    children,
}: {
    compact?: boolean;
    busy?: boolean;
    children?: ReactNode;
}) {
    return (
        <header
            className={`mx-auto flex w-full max-w-3xl shrink-0 items-end justify-between gap-3 ${
                compact
                    ? 'px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 sm:px-6 sm:pt-5 sm:pb-4'
                    : 'px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-4 sm:px-6 sm:pt-10 sm:pb-6'
            }`}
        >
            <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] tracking-[0.28em] text-sienna uppercase sm:text-[11px]">
                    Research desk
                </p>
                <h1
                    className={`mt-1 font-display tracking-tight text-ink ${
                        compact
                            ? 'text-2xl sm:text-3xl'
                            : 'text-3xl sm:text-4xl md:text-5xl'
                    }`}
                >
                    Atelier
                </h1>
                {children}
            </div>
            {busy === undefined ? null : (
                <span className="mb-0.5 shrink-0 font-mono text-[10px] tracking-widest text-sage uppercase sm:text-[11px]">
                    {busy ? 'In session' : 'Idle'}
                </span>
            )}
        </header>
    );
}
