'use client';

import ChatSession from '@/components/chat-session';
import DeskMasthead from '@/components/desk-masthead';
import { loadStoredThread, type StoredThread } from '@/lib/chat-thread';
import { useEffect, useState } from 'react';

export default function ChatView() {
    const [thread, setThread] = useState<StoredThread | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setThread(loadStoredThread()), 0);
        return () => window.clearTimeout(timer);
    }, []);

    if (!thread) {
        return (
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <DeskMasthead>
                    <p className="mt-2 max-w-md text-[14px] text-ink-soft sm:text-[15px]">
                        A streaming research assistant for psychology.
                        Literature lookups stay in this thread so follow-ups
                        remember what was just found.
                    </p>
                </DeskMasthead>
            </main>
        );
    }

    return <ChatSession key={thread.id} initial={thread} />;
}
