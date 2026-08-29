'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const BOTTOM_SLACK = 80;

function isScrolledToBottom(scroller: HTMLElement) {
    return (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
        BOTTOM_SLACK
    );
}

/**
 * Pins a scroll pane to the bottom while content grows (streaming tokens,
 * markdown layout). Uses instant `scrollTop` once per frame so stacked
 * smooth-scroll animations cannot fight each other.
 *
 * `watch` should change when the list updates (e.g. `messages`).
 */
export function useStickToBottom(watch: unknown) {
    const scrollerRef = useRef<HTMLElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    const pin = useCallback(() => {
        stickToBottomRef.current = true;
        const scroller = scrollerRef.current;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, []);

    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller || !stickToBottomRef.current) return;
        scroller.scrollTop = scroller.scrollHeight;
    }, [watch]);

    useEffect(() => {
        const scroller = scrollerRef.current;
        const content = contentRef.current;
        if (!scroller || !content) return;

        let frame = 0;
        const follow = () => {
            if (!stickToBottomRef.current) return;
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (!stickToBottomRef.current) return;
                scroller.scrollTop = scroller.scrollHeight;
            });
        };

        const onScroll = () => {
            stickToBottomRef.current = isScrolledToBottom(scroller);
        };

        scroller.addEventListener('scroll', onScroll, { passive: true });
        const observer = new ResizeObserver(follow);
        observer.observe(content);

        return () => {
            scroller.removeEventListener('scroll', onScroll);
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, []);

    return { scrollerRef, contentRef, pin };
}
