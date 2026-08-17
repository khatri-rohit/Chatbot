"use client";

import Chat from "@/components/Chat";
import { ActiveChatProvider } from "@/hooks/use-active-chat";

export default function Chatbot() {
  return (
    <ActiveChatProvider>
      <Chat />
    </ActiveChatProvider>
  );
}
