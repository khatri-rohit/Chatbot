import type { HitlData, HitlDecision } from '@/lib/ai/types';

const WEB_SEARCH_TOOLS = new Set(['internet_search']);

type GraphInterrupt = {
    id?: string;
    value?: {
        actionRequests?: Array<{
            name?: string;
            args?: unknown;
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
    interrupts?: GraphInterrupt[];
    tasks?: Array<{
        interrupts?: GraphInterrupt[];
        state?: GraphSnapshot;
    }>;
    values?: { __interrupt__?: GraphInterrupt[] };
};

function collectInterrupts(
    snapshot: GraphSnapshot | null | undefined,
): GraphInterrupt[] {
    if (!snapshot) return [];

    const found: GraphInterrupt[] = [];
    if (snapshot.interrupts?.length) {
        found.push(...snapshot.interrupts);
    }

    for (const task of snapshot.tasks ?? []) {
        if (task.interrupts?.length) {
            found.push(...task.interrupts);
        }
        if (
            task.state &&
            typeof task.state === 'object' &&
            !('then' in task.state)
        ) {
            found.push(...collectInterrupts(task.state));
        }
    }

    if (found.length > 0) return found;
    return snapshot.values?.__interrupt__ ?? [];
}

function actionRequestsOf(interrupt: GraphInterrupt) {
    return interrupt.value?.actionRequests ?? [];
}

/**
 * Reads a LangGraph checkpoint snapshot after the stream ends.
 * Used by `/api/chat` to emit a `data-hitl` UI part the chat view can render.
 *
 * Nested internet_search interrupts live on subgraph tasks. Callers must
 * pass `getState(config, { subgraphs: true })` so `tasks[].state` is filled.
 * pendingCount is hanging actionRequests.length across those interrupts.
 */
export function extractHitlData(
    snapshot: GraphSnapshot | null | undefined,
    threadId: string,
): HitlData | null {
    const interrupts = collectInterrupts(snapshot);

    if (interrupts.length === 0) return null;

    const actions = interrupts.flatMap(actionRequestsOf);

    if (actions.length === 0) return null;

    const firstWithActions =
        interrupts.find((interrupt) => actionRequestsOf(interrupt).length > 0) ??
        interrupts[0];
    const review = firstWithActions?.value?.reviewConfigs?.[0];
    const actionNames = actions.map((action) => action.name ?? '');

    return {
        threadId,
        actionName: actionNames[0] ?? '',
        description:
            actions[0].description ?? `Approve ${actions.length} tool call(s).`,
        arguments: actions[0].args ?? actions[0].arguments,
        allowedDecisions: review?.allowedDecisions ?? ['approve', 'reject'],
        pendingCount: actions.length,
        actionNames,
    };
}

export function isAutoApprovableWebSearch(hitl: HitlData) {
    const names =
        hitl.actionNames.length > 0 ? hitl.actionNames : [hitl.actionName];
    return (
        names.length > 0 && names.every((name) => WEB_SEARCH_TOOLS.has(name))
    );
}

export function webSearchApproveDecisions(
    pendingCount: number,
): HitlDecision[] {
    return Array.from({ length: Math.max(1, pendingCount) }, () => ({
        type: 'approve' as const,
        message: 'Approved',
    }));
}
