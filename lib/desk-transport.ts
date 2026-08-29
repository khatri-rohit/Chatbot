import type { DeskUIMessage, HitlDecision } from '@/lib/ai/types';
import { DefaultChatTransport } from 'ai';

export type TransportExtras = {
    resume?: { decisions: HitlDecision[] };
    webSearchEnabled: boolean;
};

const bags = new WeakMap<
    DefaultChatTransport<DeskUIMessage>,
    TransportExtras
>();

export function extrasOf(transport: DefaultChatTransport<DeskUIMessage>) {
    return bags.get(transport);
}

export function createDeskTransport() {
    const extras: TransportExtras = { webSearchEnabled: false };
    const transport = new DefaultChatTransport<DeskUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id,
                messages,
                resume: extras.resume,
                webSearchEnabled: extras.webSearchEnabled,
            },
        }),
    });
    bags.set(transport, extras);
    return transport;
}
