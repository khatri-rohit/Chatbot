// app/client-component.tsx
'use client';
import { useState } from 'react';

export default function ChatView() {
    const [output, setOutput] = useState('');

    const startListening = async () => {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: JSON.stringify({ query: 'What is human emotion' }),
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) return;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            // Accumulate streaming chunks in real-time
            setOutput((prev) => prev + decoder.decode(value));
        }
    };

    return (
        <div>
            <button onClick={startListening}>Stream Data</button>
            <p>{output}</p>
        </div>
    );
}
