'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';

const plugins = { code, mermaid, math, cjk };

export default function AssistantMarkdown({
    children,
    isStreaming,
}: {
    children: string;
    isStreaming: boolean;
}) {
    return (
        <Streamdown
            className="assistant-markdown min-w-0 max-w-full"
            plugins={plugins}
            animated
            isAnimating={isStreaming}
            mermaid={{ config: { theme: 'neutral' } }}
        >
            {children}
        </Streamdown>
    );
}
