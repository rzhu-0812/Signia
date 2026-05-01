/**
 * ConversationMode.tsx
 * Design: Warm Paper Studio
 * - Two-panel deaf ↔ hearing chat UI
 * - Chat bubbles: teal for signing user, slate for hearing user
 * - iMessage-style layout
 * - Hearing user types in a text input
 */

"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";

export interface ConversationMessage {
  id: string;
  role: "signer" | "hearing";
  text: string;
  timestamp: Date;
}

interface ConversationModeProps {
  signerMessage: string; // latest autocorrected text from signer
  onSignerSend: () => void; // called when signer sends their message
}

export function ConversationMode({
  signerMessage,
  onSignerSend,
}: ConversationModeProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [hearingInput, setHearingInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const sendSignerMessage = () => {
    if (!signerMessage.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "signer",
        text: signerMessage,
        timestamp: new Date(),
      },
    ]);
    onSignerSend();
    scrollToBottom();
  };

  const sendHearingMessage = () => {
    if (!hearingInput.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "hearing",
        text: hearingInput.trim(),
        timestamp: new Date(),
      },
    ]);
    setHearingInput("");
    scrollToBottom();
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Chat history */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-3 px-1 py-2 min-h-[300px] max-h-[400px]"
        aria-label="Conversation history"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-stone-300 text-sm text-center px-6">
            Start signing to send a message, or type a reply below.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={[
              "flex",
              msg.role === "signer" ? "justify-start" : "justify-end",
            ].join(" ")}
          >
            <div
              className={[
                "max-w-[75%] px-4 py-2.5 rounded-2xl text-base leading-snug",
                msg.role === "signer"
                  ? "bg-teal-500 text-white rounded-tl-sm"
                  : "bg-slate-100 text-slate-800 rounded-tr-sm",
              ].join(" ")}
            >
              <p>{msg.text}</p>
              <p
                className={[
                  "text-xs mt-1 opacity-60",
                  msg.role === "signer" ? "text-teal-100" : "text-slate-400",
                ].join(" ")}
              >
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Signer send row */}
      <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-2xl border border-teal-100">
        <div className="flex-1 text-sm text-teal-800 truncate">
          {signerMessage || (
            <span className="text-teal-400">Sign something to send…</span>
          )}
        </div>
        <button
          onClick={sendSignerMessage}
          disabled={!signerMessage.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 text-white text-sm font-medium rounded-xl hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          aria-label="Send signed message"
        >
          <Send size={13} />
          Send
        </button>
      </div>

      {/* Hearing user input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={hearingInput}
          onChange={(e) => setHearingInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendHearingMessage();
          }}
          placeholder="Type a reply…"
          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
          aria-label="Hearing user reply input"
        />
        <button
          onClick={sendHearingMessage}
          disabled={!hearingInput.trim()}
          className="p-2.5 bg-slate-700 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-label="Send typed reply"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
