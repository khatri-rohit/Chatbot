/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useContext,
  createContext,
  ReactElement,
  useState,
  useMemo,
} from "react";
import { useChat, UIMessage } from "@ai-sdk/react";
import {
  ChatStatus,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

interface ActiveChatContextValue {
  input: string;
  setInput: (input: string) => void;
  messages: UIMessage[];
  sendMessage: any;
  status: ChatStatus;
  stop: () => Promise<any | undefined>;
  error: any;
}

export const ActiveChatProvider = ({
  children,
}: {
  children: ReactElement;
}) => {
  const [input, setInput] = useState("");

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    // sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) {
        return;
      }
      console.log(toolCall.toolCallId);
      console.log(toolCall.toolName);
    },
  });

  const value = useMemo<ActiveChatContextValue>(
    () => ({
      input,
      setInput,
      messages,
      setMessages,
      sendMessage,
      status,
      stop,
      error,
    }),
    [input, setInput, messages, setMessages, sendMessage, status, stop, error],
  );
  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
};
export const useActiveChat = () => {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within ActiveChatProvider");
  }
  return context;
};
