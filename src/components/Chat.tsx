/* eslint-disable @typescript-eslint/no-explicit-any */
import { useActiveChat } from "@/hooks/use-active-chat";
import { Loader2 } from "lucide-react";

function weatherLabel(input: unknown) {
  if (!input || typeof input !== "object") return "this location";
  const value = input as {
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  if (value.city) return value.city;
  if (value.latitude != null && value.longitude != null) {
    return `${value.latitude}, ${value.longitude}`;
  }
  return "this location";
}

const Chat = () => {
  const {
    addToolApprovalResponse,
    error,
    input,
    messages,
    sendMessage,
    setInput,
    status,
    stop,
  } = useActiveChat();
  //   console.log(messages);

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
                <div
                  key={message.id}
                  className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  {message.parts.map((part, i) => {
                    const type = part.type;
                    const isReponseDone = message.parts.find(
                      (part: any) => part?.state === "done",
                    );
                    if (type === "text") {
                      return (
                        <span key={`${message.id}-${i}`}>{part.text}</span>
                      );
                    } else if (type === "tool-getWeather") {
                      const location = weatherLabel(part.input);
                      const approvalId = part.approval?.id;

                      if (part.state === "approval-requested" && approvalId) {
                        return (
                          <div
                            key={`${message.id}-${i}`}
                            className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <p className="text-zinc-700 dark:text-zinc-300">
                              Allow weather lookup for {location}?
                            </p>
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: approvalId,
                                    approved: false,
                                    reason: "User denied weather lookup",
                                  })
                                }
                              >
                                Deny
                              </button>
                              <button
                                type="button"
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: approvalId,
                                    approved: true,
                                  })
                                }
                              >
                                Allow
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (part.state === "output-denied") {
                        return (
                          <p
                            key={`${message.id}-${i}`}
                            className="text-sm text-zinc-500"
                          >
                            Weather lookup was denied.
                          </p>
                        );
                      }

                      if (part.state === "output-available") {
                        const output = part.output as {
                          cityName?: string;
                          current?: { temperature_2m?: number };
                          error?: string;
                        };
                        if (output?.error) {
                          return (
                            <p
                              key={`${message.id}-${i}`}
                              className="text-sm text-red-600"
                            >
                              {output.error}
                            </p>
                          );
                        }
                        return (
                          <p
                            key={`${message.id}-${i}`}
                            className="text-sm text-zinc-700 dark:text-zinc-300"
                          >
                            Weather
                            {output?.cityName ? ` in ${output.cityName}` : ""}
                            {output?.current?.temperature_2m != null
                              ? `: ${output.current.temperature_2m}°C`
                              : " loaded."}
                          </p>
                        );
                      }

                      if (part.state === "output-error") {
                        return (
                          <p
                            key={`${message.id}-${i}`}
                            className="text-sm text-red-600"
                          >
                            {part.errorText}
                          </p>
                        );
                      }
                    } else if (!isReponseDone && type === "data-status")
                      return (
                        <span
                          key={`${message.id}-${i}`}
                          className="inline-flex animate-spin text-zinc-500 "
                        >
                          <Loader2 className="size-4" />
                        </span>
                      );
                  })}
                </div>
              ))}
            </ul>
          )}
        </div>

        {/* {(status === "submitted" || status === "streaming") && (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        )} */}

        {error && (
          <p className="text-sm text-red-600 text-center w-full">
            Something went wrong.
          </p>
        )}

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
            {status === "submitted" || status === "streaming" ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={status !== "ready" || !input.trim()}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
};

export default Chat;
