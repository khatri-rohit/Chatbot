import { z } from 'zod';

/**
 * Body sent by `useChat` + `DefaultChatTransport` (`components/chat-view.tsx`).
 *
 * - `id`        → LangGraph `configurable.thread_id` (same value as useChat id)
 * - `messages`  → AI SDK UIMessage[]; on an existing thread the route uses
 *                 only the last user message, not a full transcript replay
 * - `resume`            → HITL decision after Approve/Deny; route runs `Command({ resume })`
 * - `webSearchEnabled`  → pin is on; route auto-approves internet_search interrupts
 */
export const chatRequestSchema = z.object({
    id: z.string().min(1),
    messages: z.array(z.unknown()).min(1),
    webSearchEnabled: z.boolean().optional(),
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
