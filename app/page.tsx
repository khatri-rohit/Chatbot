import ChatView from '@/components/chat-view';
import { jsonLdGraph } from '@/lib/site';

export default function Home() {
    const jsonLd = jsonLdGraph();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ChatView />
            </div>
        </>
    );
}
