import { SCOPE_REFUSAL, SCOPE_REMINDER } from '@/lib/ai/prompts';
import { AIMessage, HumanMessage, createMiddleware } from 'langchain';
import { RemoveMessage } from '@langchain/core/messages';

/**
 * LangChain guardrails (docs: beforeAgent jumpTo end + wrapModelCall).
 *
 * Prompts cannot strip coding skill from a general model. This middleware
 * is the harness: block off-scope turns before the LLM runs, remind the
 * model each call, and replace a code-fence reply if one still lands.
 */
const LANGUAGE =
    'python|javascript|typescript|golang|ruby|php|swift|kotlin|rust|java';

const OUT_OF_SCOPE: readonly RegExp[] = [
    new RegExp(
        String.raw`\b(write|create|make|build|code|implement|script)\b[\s\S]{0,80}\b(${LANGUAGE}|program|code|script|app|function|class)\b`,
        'i',
    ),
    new RegExp(
        String.raw`\b(${LANGUAGE})\s+(program|script|code|function|class|tutorial)\b`,
        'i',
    ),
    new RegExp(String.raw`\b(in|into|with|using|on)\s+(${LANGUAGE})\b`, 'i'),
    /\bwrite (a |me )?program\b/i,
    /\b(what('?s| is) the weather|weather in|forecast for)\b/i,
];

const PROGRAMMING_FENCE =
    /```(?:python|py|javascript|js|typescript|ts|java|go|rust|ruby|php|swift|kotlin|c\+\+|cpp|csharp|cs|html|css|sql)\b/i;

export const psychologyScope = createMiddleware({
    name: 'PsychologyScope',
    beforeAgent: {
        canJumpTo: ['end'],
        hook: (state) => {
            const text = lastHumanText(state.messages);
            if (!text || !isOutOfScopeRequest(text)) return;
            return {
                messages: [new AIMessage(SCOPE_REFUSAL)],
                jumpTo: 'end',
            };
        },
    },
    wrapModelCall: async (request, handler) => {
        const result = await handler({
            ...request,
            systemMessage: request.systemMessage.concat(SCOPE_REMINDER),
        });
        if (!AIMessage.isInstance(result) || result.tool_calls?.length) {
            return result;
        }
        if (!hasProgrammingFence(messageText(result))) return result;
        return new AIMessage(SCOPE_REFUSAL);
    },
    afterModel: {
        canJumpTo: ['end'],
        hook: (state) => {
            const last = state.messages.at(-1);
            if (!AIMessage.isInstance(last) || last.tool_calls?.length) {
                return;
            }
            if (!hasProgrammingFence(messageText(last))) return;
            const replacement = new AIMessage(SCOPE_REFUSAL);
            if (!last.id) {
                return { messages: [replacement], jumpTo: 'end' };
            }
            return {
                messages: [
                    new RemoveMessage({ id: last.id }),
                    replacement,
                ],
                jumpTo: 'end',
            };
        },
    },
});

function isOutOfScopeRequest(text: string): boolean {
    return OUT_OF_SCOPE.some((pattern) => pattern.test(text));
}

function hasProgrammingFence(text: string): boolean {
    return PROGRAMMING_FENCE.test(text);
}

function lastHumanText(messages: unknown[]): string | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (!HumanMessage.isInstance(message)) continue;
        const text = messageText(message).trim();
        if (text) return text;
    }
    return undefined;
}

function messageText(message: {
    text?: string;
    content?: unknown;
}): string {
    if (typeof message.text === 'string' && message.text.length > 0) {
        return message.text;
    }
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (
                part &&
                typeof part === 'object' &&
                'text' in part &&
                typeof part.text === 'string'
            ) {
                return part.text;
            }
            return '';
        })
        .join(' ');
}
