import type { UIMessage } from 'ai';

/**
 * Shared UI-message types.
 *
 * Flow:
 *   useChat<DeskUIMessage>  →  POST /api/chat (UIMessage[])
 *     → toBaseMessages()    →  Deep Agent / LangGraph
 *     → toUIMessageStream() →  message.parts in the client
 *
 * Custom `data-*` parts (hitl, progress) are written by the route/tool
 * and rendered in `components/message-parts.tsx`.
 */

export type HitlDecision = {
    type: 'approve' | 'reject';
    message?: string;
};

/** Persisted on the assistant message when LangGraph pauses for approval. */
export type HitlData = {
    threadId: string;
    actionName: string;
    description: string;
    arguments: unknown;
    allowedDecisions: Array<'approve' | 'reject'>;
    pendingCount: number;
    actionNames: string[];
};

/** Optional live status from a LangChain tool `config.writer()`. */
export type ProgressData = {
    message: string;
    step?: string;
};

export type DeskDataParts = {
    hitl: HitlData;
    progress: ProgressData;
};

export type DeskUIMessage = UIMessage<never, DeskDataParts>;

/** LangGraph `configurable` fields for this desk. */
export type DeskConfigurable = {
    thread_id: string;
    webSearchEnabled?: boolean;
};
