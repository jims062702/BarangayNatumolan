import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiMessageCircle, FiSend, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
import { api } from "../../lib/api";
import { useSoundMuted } from "../../hooks/useSoundMuted";
import { playChatSound } from "../../lib/sound";
import { ensureNotifyPermission, showDesktopNotification } from "../../lib/desktopNotify";
import logo from "../../assets/logo/logo.svg";

/**
 * Floating AI chatbot (bottom-right).
 *
 * Talks to a Rasa server through its REST channel. When the Rasa server is
 * not running, it falls back to the built-in service-guide assistant
 * (POST /api/assistant/inquiry) so the widget always answers.
 */
const RASA_URL =
  (import.meta.env.VITE_RASA_URL as string | undefined) ?? "http://localhost:5005";

interface ChatButton {
  title: string;
  payload: string;
}

interface ChatMessage {
  id: number;
  from: "bot" | "user";
  text: string;
  buttons?: ChatButton[];
}

interface RasaReply {
  text?: string;
  image?: string;
  buttons?: ChatButton[];
}

/** Stable anonymous sender id so Rasa keeps the conversation context. */
function senderId(): string {
  const KEY = "bn-chat-sender";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "web-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}

const WELCOME: ChatMessage = {
  id: 0,
  from: "bot",
  text:
    "Kumusta! 👋 I'm the Barangay Natumolan assistant. Ask me about certificates, " +
    "fees, requirements, office hours, or how to use the resident portal.",
  buttons: [
    { title: "What certificates can I get?", payload: "What certificates can I get?" },
    { title: "How much are the fees?", payload: "How much are the certificate fees?" },
    { title: "Office hours", payload: "What are your office hours?" },
    { title: "How do I get a portal account?", payload: "How do I get a resident portal account?" },
    { title: "Who developed this?", payload: "Who developed the Barangay Natumolan System?" },
  ],
};

let nextId = 1;

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [muted, toggleMuted] = useSoundMuted();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep the newest message in view.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, open]);

  /** Ask Rasa first; if it is unreachable, use the built-in assistant. */
  const askBot = async (text: string): Promise<ChatMessage[]> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`${RASA_URL}/webhooks/rest/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderId(), message: text }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error("Rasa unavailable");
      const replies: RasaReply[] = await response.json();
      if (replies.length === 0) {
        return [
          {
            id: nextId++,
            from: "bot",
            text: "Sorry, I did not catch that. Could you say it another way?",
          },
        ];
      }
      return replies.map((reply) => ({
        id: nextId++,
        from: "bot" as const,
        text: reply.text ?? "",
        buttons: reply.buttons,
      }));
    } catch {
      // Rasa offline — fall back to the built-in service-guide assistant.
      try {
        const response = await api.post("/assistant/inquiry", { message: text });
        return [{ id: nextId++, from: "bot", text: response.data.data.answer }];
      } catch {
        return [
          {
            id: nextId++,
            from: "bot",
            text:
              "I cannot reach the assistant right now. Please try again in a moment, " +
              "or visit the Barangay Main Office (Mon–Fri, 8:00 AM–5:00 PM).",
          },
        ];
      }
    }
  };

  const send = async (text: string, display?: string) => {
    const clean = text.trim();
    if (!clean || typing) return;
    setMessages((prev) => [...prev, { id: nextId++, from: "user", text: display ?? clean }]);
    setInput("");
    setTyping(true);
    const replies = await askBot(clean);
    setTyping(false);
    setMessages((prev) => [...prev, ...replies]);
    // Soft pop when the assistant replies (like an incoming message).
    playChatSound();
    // If the user tabbed away while waiting, show a desktop popup so they
    // know the assistant answered.
    if (document.hidden) {
      const reply = replies.find((r) => r.text)?.text ?? "The assistant replied to your message.";
      showDesktopNotification("Natumolan Assistant", reply, "bn-chat");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(input);
  };

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Barangay Natumolan assistant"
          className="fixed bottom-24 right-4 z-50 flex max-h-[min(37rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-gray bg-white shadow-2xl shadow-primary/20 sm:right-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-primary-dark to-primary px-5 py-4">
            <img src={logo} alt="" aria-hidden="true" className="h-10 w-10 rounded-full bg-white/90 p-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">Natumolan Assistant</p>
              <p className="flex items-center gap-1.5 text-xs text-white/80">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-success" />
                Online — ask me anything
              </p>
            </div>
            <button
              type="button"
              onClick={toggleMuted}
              aria-label={muted ? "Turn message sound on" : "Turn message sound off"}
              title={muted ? "Sound off — click to turn on" : "Sound on — click to mute"}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              {muted ? <FiVolumeX className="h-5 w-5" /> : <FiVolume2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-secondary/60 px-4 py-4">
            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={
                    message.from === "user"
                      ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white"
                      : "w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-dark shadow-sm"
                  }
                >
                  {message.text}
                </div>
                {message.from === "bot" && message.buttons && message.buttons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.buttons.map((button, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => void send(button.payload, button.title)}
                        className="cursor-pointer rounded-full border border-primary/40 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                      >
                        {button.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div aria-label="Assistant is typing" className="flex w-fit gap-1.5 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="h-2 w-2 animate-bounce rounded-full bg-primary/60"
                    style={{ animationDelay: `${n * 150}ms` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-gray bg-white px-3 py-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              aria-label="Type your question"
              className="flex-1 rounded-full border border-gray bg-secondary/60 px-4 py-2.5 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || typing}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FiSend className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Floating launcher — bottom right */}
      <button
        type="button"
        aria-label={open ? "Close the barangay assistant" : "Chat with the barangay assistant"}
        onClick={() => {
          setOpen((o) => !o);
          // Opening the chat is a good moment to ask for desktop-alert
          // permission (a user gesture) — enables reply popups when tabbed away.
          void ensureNotifyPermission();
        }}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/40 transition-all duration-300 hover:scale-110 hover:bg-primary-dark sm:right-6"
      >
        {open ? <FiX className="h-6 w-6" /> : <FiMessageCircle className="h-6 w-6" />}
        {!open && (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/40"
            style={{ animationDuration: "2.5s" }}
          />
        )}
      </button>
    </>
  );
}
