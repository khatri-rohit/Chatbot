"use client";

import { useState } from "react";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";

export default function Chatbot() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Chat
        </h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Send a message to start the conversation.
              </p>
            </div>
          ) : (
            <ul className="mx-auto flex w-full max-w-2xl flex-col gap-4 transition-all">
              {messages.map((message) => (
                <div key={message.id}>
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <span key={`${message.id}-${i}`}>{part.text}</span>
                    ) : null,
                  )}
                </div>
              ))}
            </ul>
          )}
        </div>

        {(status === "submitted" || status === "streaming") && (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        )}

        {error && <p>Something went wrong.</p>}

        {/* <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || status !== "ready") return;
            sendMessage({ text: input });
            setInput("");
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status !== "ready"}
          />
          <button type="submit" disabled={status !== "ready" || !input.trim()}>
            Send
          </button>
        </form> */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || status !== "ready") return;
            sendMessage({ text: input });
            setInput("");
          }}
          className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Type a message…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={status !== "ready" || !input.trim()}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
