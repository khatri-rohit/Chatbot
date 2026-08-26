import { ToolMessage, createMiddleware } from 'langchain';
import { isGraphBubbleUp, isGraphInterrupt } from '@langchain/langgraph';

/**
 * Runs around every Deep Agent tool call (see `createDeepAgent({ middleware })`).
 *
 * Ollama often omits `tool_call.id`. The AI SDK adapter (and ToolMessage)
 * correlate start/end by that id. We assign one here so `tool-get_weather`
 * parts in the UI can show input and output.
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
            console.error(error);
            if (isGraphInterrupt(error) || isGraphBubbleUp(error)) {
                throw error;
            }
            return new ToolMessage({
                content: `Tool error: check the input and try again. (${error})`,
                tool_call_id: request.toolCall.id,
            });
        }
    },
});
