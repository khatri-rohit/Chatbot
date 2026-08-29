'use client';

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

const BOTTOM_SLACK = 80;

function isScrolledToBottom(scroller: HTMLElement) {
    return (
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
        BOTTOM_SLACK
    );
}

/**
 * Pins a scroll pane to the bottom while content grows.
 * Instant `scrollTop`, one frame at a time. Scroll up to unpin.
 */
export function useStickToBottom(watch: unknown) {
    const scrollerRef = useRef<HTMLElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const [atBottom, setAtBottom] = useState(true);

    const pin = useCallback(() => {
        stickToBottomRef.current = true;
        setAtBottom(true);
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
            const next = isScrolledToBottom(scroller);
            stickToBottomRef.current = next;
            setAtBottom((prev) => (prev === next ? prev : next));
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

    return { scrollerRef, contentRef, pin, atBottom };
}
