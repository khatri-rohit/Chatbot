function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
    const prompts = [
        'What is human emotion?',
        'How does working memory differ from long-term memory?',
        "What's the weather in Ajmer?",
    ];

    return (
        <div className="mt-6 border border-dashed border-(--rule) px-6 py-10">
            <p className="font-display text-2xl">A blank page.</p>
            <p className="mt-2 max-w-lg text-ink-soft">
                The model replies in Markdown. This desk renders it live — no
                asterisks, no literal{' '}
                <code className="font-mono text-[13px]">\n</code>.
            </p>
            <ul className="mt-6 flex flex-col gap-2">
                {prompts.map((prompt) => (
                    <li key={prompt}>
                        <button
                            type="button"
                            onClick={() => onPick(prompt)}
                            className="text-left text-sienna underline decoration-(--rule) underline-offset-4 hover:decoration-sienna"
                        >
                            {prompt}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default EmptyState;
