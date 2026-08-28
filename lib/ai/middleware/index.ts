import { ToolMessage, createMiddleware } from 'langchain';
import { isGraphBubbleUp, isGraphInterrupt } from '@langchain/langgraph';

/**
 * Runs around every Deep Agent tool call (see `createDeepAgent({ middleware })`).
 *
 * Ollama often omits `tool_call.id`. The AI SDK adapter (and ToolMessage)
 * correlate start/end by that id. We assign one here so `tool-internet_search`
 * parts in the UI can show input and output.
 *
 * Nested HITL (if a subgraph still interrupts) throws GraphInterrupt.
 * That MUST bubble to `/api/chat`. Converting it into a `task` ToolMessage
 * makes the parent retry the same research job.
 */

export const handleToolCalls = createMiddleware({
    name: 'HandleToolCalls',
    // wrapModelCall: async (request, handler) => {
    //     const result = await handler(request);
    //     const message = result;
    //     console.log('message wrapModelCall', message);
    //     if (!AIMessage.isInstance(message)) {
    //         return result;
    //     }
    //
    //     const calls = message.tool_calls ?? [];
    //     if (calls.length <= 1) return result;
    //
    //     message.tool_calls = [calls[0]];
    //     return result;
    // },
    wrapToolCall: async (request, handler) => {
        if (!request.toolCall.id) {
            request.toolCall.id = crypto.randomUUID();
        }

        try {
            return await handler(request);
        } catch (error) {
            if (isInterruptAdjacentError(error)) {
                throw error;
            }
            console.error(error);
            return new ToolMessage({
                content: `Tool error: check the input and try again. (${error})`,
                tool_call_id: request.toolCall.id,
                status: 'error',
            });
        }
    },
});

function isInterruptAdjacentError(error: unknown, depth = 0): boolean {
    if (error == null || depth > 6) return false;
    if (isGraphInterrupt(error) || isGraphBubbleUp(error)) return true;

    if (typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name : '';
        if (
            name === 'GraphInterrupt' ||
            name === 'NodeInterrupt' ||
            name === 'GraphBubbleUp' ||
            name === 'ParentCommand' ||
            name === 'GraphDrained'
        ) {
            return true;
        }
        if (record.is_bubble_up === true) return true;
        if (Array.isArray(record.interrupts)) return true;
        if (
            Array.isArray(error) &&
            error.some(
                (item) =>
                    item != null &&
                    typeof item === 'object' &&
                    'value' in item &&
                    item.value != null &&
                    typeof item.value === 'object' &&
                    'actionRequests' in (item.value as object),
            )
        ) {
            return true;
        }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
        /Number of human decisions/i.test(message) ||
        /Invalid HITLResponse/i.test(message) ||
        /Unexpected human decision/i.test(message) ||
        /GraphInterrupt/i.test(message) ||
        /hanging tool calls/i.test(message) ||
        /"actionRequests"\s*:/.test(message)
    ) {
        return true;
    }

    if (typeof error === 'object' && error !== null) {
        if (
            'cause' in error &&
            isInterruptAdjacentError(error.cause, depth + 1)
        ) {
            return true;
        }
        if (
            'error' in error &&
            isInterruptAdjacentError(error.error, depth + 1)
        ) {
            return true;
        }
    }

    return false;
}
