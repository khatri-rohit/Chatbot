"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useContext,
  createContext,
  ReactElement,
  useState,
  useMemo,
} from "react";
import { useChat, UIMessage, type UseChatHelpers } from "@ai-sdk/react";
import {
  ChatStatus,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
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
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
}

export const ActiveChatProvider = ({
  children,
}: {
  children: ReactElement;
}) => {
  const [input, setInput] = useState("");

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error,
    addToolApprovalResponse,
  } = useChat({
    transport: new DefaultChatTransport({ api: "/api/pdf" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
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
      addToolApprovalResponse,
    }),
    [
      input,
      setInput,
      messages,
      setMessages,
      sendMessage,
      status,
      stop,
      error,
      addToolApprovalResponse,
    ],
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
