import { z } from 'zod';

/** POST /api/chat body from `useChat`. `id` is the LangGraph thread. */
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
