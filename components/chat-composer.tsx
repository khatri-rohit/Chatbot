'use client';

import { Pin } from 'lucide-react';
import { FormEvent, type RefObject } from 'react';

export default function ChatComposer({
    draft,
    onDraftChange,
    busy,
    webSearchEnabled,
    onToggleWebSearch,
    pinOpen,
    onTogglePin,
    pinRef,
    onSubmit,
    onStop,
    errorMessage,
}: {
    draft: string;
    onDraftChange: (value: string) => void;
    busy: boolean;
    webSearchEnabled: boolean;
    onToggleWebSearch: () => void;
    pinOpen: boolean;
    onTogglePin: () => void;
    pinRef: RefObject<HTMLDivElement | null>;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onStop: () => void;
    errorMessage?: string;
}) {
    return (
        <form
            onSubmit={onSubmit}
            className="shrink-0 border-t border-(--rule) bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md sm:px-4 sm:pt-4"
        >
            <div className="mx-auto flex w-full min-w-0 max-w-3xl items-end gap-2 sm:gap-3">
                <div ref={pinRef} className="relative shrink-0">
                    <button
                        type="button"
                        aria-label="Tools"
                        aria-expanded={pinOpen}
                        onClick={onTogglePin}
                        className={`flex h-11 w-11 items-center justify-center rounded-sm border transition-colors focus-visible:ring-2 focus-visible:ring-sienna/50 focus-visible:outline-none sm:h-12 sm:w-12 ${
                            webSearchEnabled
                                ? 'border-sage bg-sage text-paper'
                                : 'border-(--rule) text-ink-soft hover:border-ink hover:text-ink'
                        }`}
                    >
                        <Pin className="size-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    {pinOpen ? (
                        <div
                            role="menu"
                            className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-56 max-w-[calc(100vw-2rem)] border border-(--rule) bg-paper px-1 py-1 shadow-[0_-8px_24px_rgba(36,24,15,0.08)]"
                        >
                            <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={webSearchEnabled}
                                onClick={onToggleWebSearch}
                                className="flex w-full items-center justify-between px-3 py-2.5 text-left font-mono text-[11px] tracking-[0.14em] uppercase hover:bg-paper-deep/70"
                            >
                                Web search
                                <span
                                    className={
                                        webSearchEnabled
                                            ? 'text-sage'
                                            : 'text-ink-soft'
                                    }
                                >
                                    {webSearchEnabled ? 'On' : 'Off'}
                                </span>
                            </button>
                        </div>
                    ) : null}
                </div>
                <label className="sr-only" htmlFor="query">
                    Question
                </label>
                <textarea
                    id="query"
                    rows={2}
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                    placeholder="What is human emotion?"
                    disabled={busy}
                    enterKeyHint="send"
                    autoComplete="off"
                    className="min-h-11 max-h-36 min-w-0 flex-1 resize-none rounded-sm border border-(--rule) bg-paper-deep/50 px-3 py-2.5 text-base outline-none ring-sienna/40 placeholder:text-ink-soft/70 focus:ring-2 disabled:opacity-60 sm:min-h-[3.2rem] sm:max-h-48 sm:px-4 sm:py-3"
                />
                {busy ? (
                    <button
                        type="button"
                        onClick={onStop}
                        className="h-11 shrink-0 rounded-sm border border-ink px-3 font-mono text-[11px] tracking-[0.18em] whitespace-nowrap uppercase sm:h-12 sm:px-4 sm:text-xs"
                    >
                        Stop
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="h-11 shrink-0 rounded-sm bg-sienna px-3.5 font-mono text-[11px] tracking-[0.18em] whitespace-nowrap text-paper uppercase disabled:opacity-40 sm:h-12 sm:px-5 sm:text-xs"
                    >
                        Ask
                    </button>
                )}
            </div>
            {webSearchEnabled ? (
                <p className="mx-auto mt-2 max-w-3xl font-mono text-[10px] leading-snug tracking-wide text-sage uppercase">
                    Web search pinned — the desk may look up the live web
                </p>
            ) : null}
            {errorMessage ? (
                <p
                    className="mx-auto mt-2 max-w-3xl font-mono text-xs wrap-break-word text-sienna"
                    role="alert"
                >
                    {errorMessage}
                </p>
            ) : null}
        </form>
    );
}
