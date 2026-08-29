export default function EmptyState({
    onPick,
}: {
    onPick: (prompt: string) => void;
}) {
    const prompts = [
        'What is human emotion?',
        'How does working memory differ from long-term memory?',
        'What does a meta-analysis add to a narrative review in psychology?',
    ];

    return (
        <div className="mt-2 border border-dashed border-(--rule) px-4 py-7 sm:mt-6 sm:px-6 sm:py-10">
            <p className="font-display text-xl sm:text-2xl">A blank page.</p>
            <p className="mt-2 max-w-lg text-[15px] text-ink-soft sm:text-base">
                The model replies in Markdown. This desk renders it live — no
                asterisks, no literal{' '}
                <code className="font-mono text-[13px]">\n</code>.
            </p>
            <ul className="mt-5 flex flex-col gap-2 sm:mt-6">
                {prompts.map((prompt) => (
                    <li key={prompt}>
                        <button
                            type="button"
                            onClick={() => onPick(prompt)}
                            className="text-left text-[15px] wrap-break-word text-sienna underline decoration-(--rule) underline-offset-4 hover:decoration-sienna sm:text-base"
                        >
                            {prompt}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
