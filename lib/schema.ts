import { z } from 'zod';

/**
 * Body sent by `useChat` + `DefaultChatTransport` (`components/chat-view.tsx`).
 *
 * - `id`        → LangGraph `configurable.thread_id` (same value as useChat id)
 * - `messages`  → AI SDK UIMessage[] (converted with `toBaseMessages`)
 * - `resume`    → HITL decision after Approve/Deny; route runs `Command({ resume })`
 */
export const chatRequestSchema = z.object({
    id: z.string().min(1),
    messages: z.array(z.unknown()).min(1),
    resume: z
        .object({
            decisions: z
                .array(
                    z.object({
                        type: z.enum(['approve', 'reject']),
                        message: z.string().optional(),
                    }),
                )
                .min(1),
        })
        .optional(),
});
