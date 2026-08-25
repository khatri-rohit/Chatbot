import type { HitlData } from '@/lib/ai/types';

type GraphInterrupt = {
    id?: string;
    value?: {
        actionRequests?: Array<{
            name?: string;
            arguments?: unknown;
            description?: string;
        }>;
        reviewConfigs?: Array<{
            actionName?: string;
            allowedDecisions?: Array<'approve' | 'reject'>;
        }>;
    };
};

type GraphSnapshot = {
    tasks?: Array<{ interrupts?: GraphInterrupt[] }>;
    values?: { __interrupt__?: GraphInterrupt[] };
};

/**
 * Reads a LangGraph checkpoint snapshot after the stream ends.
 * Used by `/api/chat` to emit a `data-hitl` UI part the chat view can render.
 */
export function extractHitlData(
    snapshot: GraphSnapshot | null | undefined,
    threadId: string,
): HitlData | null {
    const interrupts =
        snapshot?.tasks?.flatMap((task) => task.interrupts ?? []) ??
        snapshot?.values?.__interrupt__ ??
        [];

    if (interrupts.length === 0) return null;

    const value = interrupts[0]?.value;
    const action = value?.actionRequests?.[0];
    const review = value?.reviewConfigs?.[0];

    if (!action?.name) return null;

    return {
        threadId,
        actionName: action.name,
        description:
            action.description ??
            `The desk wants to run ${action.name}. Approve or deny.`,
        arguments: action.arguments,
        allowedDecisions: review?.allowedDecisions ?? ['approve', 'reject'],
    };
}
