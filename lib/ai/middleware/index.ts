import { ToolMessage, createMiddleware } from 'langchain';
import { isGraphBubbleUp, isGraphInterrupt } from '@langchain/langgraph';

/**
 * Assign a tool_call.id when Ollama omits one (the UI stream keys off it).
 * Re-throw LangGraph interrupts so `/api/chat` can surface HITL.
 */
export const handleToolCalls = createMiddleware({
    name: 'HandleToolCalls',
    wrapToolCall: async (request, handler) => {
        if (!request.toolCall.id) {
            request.toolCall.id = crypto.randomUUID();
        }

        try {
            return await handler(request);
        } catch (error) {
            if (isInterruptError(error)) throw error;
            console.error(error);
            return new ToolMessage({
                content: `Tool error: check the input and try again. (${error})`,
                tool_call_id: request.toolCall.id,
                status: 'error',
            });
        }
    },
});

function isInterruptError(error: unknown): boolean {
    if (error == null) return false;
    if (isGraphInterrupt(error) || isGraphBubbleUp(error)) return true;

    const text = error instanceof Error ? error.message : String(error);
    if (
        /GraphInterrupt|HITLResponse|human decisions|hanging tool calls|actionRequests/i.test(
            text,
        )
    ) {
        return true;
    }

    if (typeof error === 'object' && error !== null && 'cause' in error) {
        return isInterruptError(error.cause);
    }

    return false;
}
