import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  FiClock,
  FiFileText,
  FiHeadphones,
  FiMessageCircle,
  FiSend,
  FiVolume2,
  FiVolumeX,
  FiX,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useSoundMuted } from "../../hooks/useSoundMuted";
import { playChatSound } from "../../lib/sound";
import { ensureNotifyPermission, showDesktopNotification } from "../../lib/desktopNotify";
import logo from "../../assets/logo/logo.svg";
import type { ChatMessage as LiveMessage } from "../../types";

/**
 * Floating chat (bottom-right), with two modes.
 *
 * BOT — talks to a Rasa server through its REST channel, falling back to the
 * built-in service-guide assistant (POST /api/assistant/inquiry) so the widget
 * always answers.
 *
 * LIVE — hands the conversation to a person. The BARANGAY SECRETARY staffs
 * that desk. It is plain polling rather than a websocket: the barangay runs
 * this on one machine, and a socket server nobody restarts after a power cut
 * is worse than a request every few seconds.
 */
const RASA_URL =
  (import.meta.env.VITE_RASA_URL as string | undefined) ?? "http://localhost:5005";

/** How often the live conversation is refreshed while the panel is open. */
const LIVE_POLL_MS = 4000;

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

/**
 * localStorage, for a browser that may refuse it.
 *
 * With site data blocked — an in-app browser, a private window, a strict
 * privacy setting — every one of these THROWS rather than returning null.
 * One of them ran inside a useState initialiser, where the exception takes
 * the whole widget down during its first render: the chat button simply
 * never appears, and nothing says why.
 */
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    /* Nothing is saved, and the chat still works for this page view. */
  }
}

/** Stable anonymous sender id so Rasa keeps the conversation context. */
function senderId(): string {
  const KEY = "bn-chat-sender";
  let id = remembered(KEY);
  if (!id) {
    id = "web-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    remember(KEY, id);
  }
  return id;
}

/** The live conversation survives a page reload; a closed one is forgotten. */
const LIVE_KEY = "bn-chat-live-token";

const WELCOME: ChatMessage = {
  id: 0,
  from: "bot",
  text:
    "Kumusta! 👋 I'm the Barangay Natumolan assistant. Ask me about certificates, " +
    "fees, requirements, office hours, or how to use the resident portal.\n\n" +
    "Need a real person? Tap “Talk to the Secretary” below and I'll put you through.",
  buttons: [
    { title: "What certificates can I get?", payload: "What certificates can I get?" },
    { title: "How much are the fees?", payload: "How much are the certificate fees?" },
    { title: "Office hours", payload: "What are your office hours?" },
    { title: "How do I get a portal account?", payload: "How do I get a resident portal account?" },
    { title: "Who developed this?", payload: "Who developed the Barangay Natumolan System?" },
  ],
};

let nextId = 1;

/** A certificate the office issues, with what it needs and costs. */
interface CertificateService {
  certificate_type: string;
  fee: number;
  description?: string | null;
  requirements: string[];
}

/** One conversation the desk has finished with, as the list shows it. */
interface PastConversation {
  session_token: string;
  status: string;
  started_at?: string | null;
  closed_at?: string | null;
  agent_name?: string | null;
  messages: number;
  opening?: string | null;
}

/**
 * What the bubble says, in turn.
 *
 * The first line has to say what it IS — a round purple circle in the corner
 * of a barangay website is not obviously anything, and a resident who has
 * never used a chat widget reads it as decoration. The rest give a reason to
 * press it: somebody who does not know they can ask has no reason to.
 */
const HINT_LINES = [
  "Hi! I am the barangay chatbot.",
  "Ask me what a certificate needs.",
  "Barangay help — one tap away.",
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  /*
   * The live desk is for registered residents. The BOT above it is not — a
   * stranger asking what an indigency certificate needs still gets an answer,
   * they just cannot take up the Secretary's only chair to ask it.
   */
  const { user, loading: sessionLoading } = useAuth();
  // Not yet known is not the same as "not a resident". Deciding while the
  // session is still being verified made the widget drop a running chat
  // back to the bot on every fresh page load.
  const isResident = !sessionLoading && user?.role === "Resident";
  const [muted, toggleMuted] = useSoundMuted();
  const listRef = useRef<HTMLDivElement | null>(null);

  /*
   * The label beside the launcher.
   *
   * Shown a moment after the page settles rather than immediately: arriving
   * at the same time as the page's own reveal animation, it reads as part of
   * the furniture and is looked past.
   *
   * It has no close button. It is not a notice to be got rid of — it is the
   * button introducing itself, and it stops on its own the moment somebody
   * opens the chat, which is the only thing it is asking for.
   *
   * "Stops" means for the rest of this page view, and no longer. It used to
   * be written into sessionStorage, which on a phone is the wrong memory: a
   * mobile browser keeps a tab alive for days, so one tap switched the
   * bubble off and only a new tab brought it back.
   */
  const [hint, setHint] = useState(false);

  /* Which line is being said, how much of it is written, and whether the
     bubble is still thinking about it. */
  const [line, setLine] = useState(0);
  const [typed, setTyped] = useState("");
  const [thinking, setThinking] = useState(true);

  /*
   * Armed on arrival, and armed again every time the chat is closed.
   *
   * This used to run once, on mount, and a separate handler switched the
   * bubble off for good the moment somebody tapped it. So opening the chat
   * and closing it again left the button silent for the rest of the page
   * view, and only a reload brought it back — which is not "it stops asking
   * once you have opened it", it is a thing that broke.
   *
   * The delay is the beat before it speaks. On close it doubles as the pause
   * that stops the bubble snapping back the instant the panel disappears.
   */
  useEffect(() => {
    if (open) {
      setHint(false);

      return;
    }

    const timer = setTimeout(() => setHint(true), 1400);

    return () => clearTimeout(timer);
  }, [open]);

  /*
   * One line at a time: three dots while it "thinks", then the sentence
   * typed out, then a pause to read it, then the next one.
   *
   * Typed rather than swapped because a bubble that simply changes its words
   * every few seconds looks like a broken banner. Typing is what a chat does,
   * and it is the thing that says "something is answering" without a word.
   *
   * Somebody who has asked their system for less motion gets the sentences
   * and none of the typing.
   */
  useEffect(() => {
    if (!hint || open) return;

    const sentence = HINT_LINES[line];
    const timers: number[] = [];
    const next = () =>
      timers.push(window.setTimeout(() => setLine((n) => (n + 1) % HINT_LINES.length), 3000));

    setThinking(true);
    setTyped("");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setThinking(false);
      setTyped(sentence);
      next();
    } else {
      timers.push(
        window.setTimeout(() => {
          setThinking(false);

          let written = 0;
          const typer = window.setInterval(() => {
            written += 1;
            setTyped(sentence.slice(0, written));

            if (written >= sentence.length) {
              window.clearInterval(typer);
              next();
            }
          }, 28);

          timers.push(typer);
        }, 900)
      );
    }

    /* Timeouts and intervals share one id space in the browser, so clearing
       both is safe and saves keeping two lists. */
    return () => {
      timers.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
    };
  }, [hint, open, line]);

  /* ---- live agent ---- */
  // "form" is the short intro step; "live" is the running conversation.
  const [mode, setMode] = useState<"bot" | "form" | "live" | "signin">("bot");
  const [token, setToken] = useState<string | null>(() => remembered(LIVE_KEY));
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [liveStatus, setLiveStatus] = useState<"Waiting" | "Active" | "Closed">("Waiting");
  const [agentName, setAgentName] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  /*
   * Where they are in the line. One Secretary answers one person at a time,
   * so anyone who is not first is waiting behind somebody — and a wait with
   * no number on it is indistinguishable from a broken page.
   */
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [liveError, setLiveError] = useState("");
  const [starting, setStarting] = useState(false);
  /*
   * Conversations the desk has already resolved.
   *
   * Resolving one never deleted anything — but it dropped out of the
   * resident's view, and with it whatever they had been told: which office,
   * which day, what to bring. The desk can look a thread up whenever it
   * likes; the resident could not. So they are kept, and reachable.
   */
  const [past, setPast] = useState<PastConversation[]>([]);
  const [pastCount, setPastCount] = useState(0);
  /*
   * Requesting a certificate without leaving the chat.
   *
   * The assistant could already say what a clearance needs and what it
   * costs — and then the resident had to go and find the form themselves,
   * which is the point at which most of them stop. It is the same request
   * whichever door it comes through: same record, same pending certificate,
   * same clerk.
   */
  const [services, setServices] = useState<CertificateService[]>([]);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<CertificateService | null>(null);
  const [purpose, setPurpose] = useState("");
  const [filing, setFiling] = useState(false);

  const [showPast, setShowPast] = useState(false);
  /*
   * The follow-up box.
   *
   * `followUpFor` is the token being followed up rather than a boolean,
   * because the same box serves the live view and the reader — and in the
   * reader the thread being answered is not the one in `token`.
   */
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  const [reading, setReading] = useState<PastConversation | null>(null);
  const [readingMessages, setReadingMessages] = useState<LiveMessage[]>([]);
  // Used to ring only for genuinely new agent replies.
  const lastSeenId = useRef(0);

  useEffect(() => {
    // Keep the newest message in view.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveMessages, typing, open, mode]);

  /** Pulls the live thread. Also runs once on mount to restore a session. */
  const refreshLive = async (activeToken: string) => {
    try {
      const response = await api.get(`/chat/${activeToken}`);
      const { conversation, messages: thread } = response.data.data;
      setLiveMessages(thread);
      setLiveStatus(conversation.status);
      setAgentName(conversation.agent_name ?? null);
      setQueuePosition(conversation.queue_position ?? null);
      setQueueTotal(conversation.queue_total ?? 0);

      // Ring (and pop up, if tabbed away) for a reply that is actually new.
      const newest = [...thread].reverse().find((m: LiveMessage) => m.sender === "agent");
      if (newest && newest.id > lastSeenId.current) {
        if (lastSeenId.current !== 0) {
          playChatSound();
          if (document.hidden) {
            showDesktopNotification(
              newest.sender_name ?? "Barangay Secretary",
              newest.body,
              "bn-live-chat"
            );
          }
        }
        lastSeenId.current = newest.id;
      }
    } catch {
      // A token for a conversation that no longer exists — drop it and fall
      // back to the bot rather than polling a dead endpoint forever.
      remember(LIVE_KEY, null);
      setToken(null);
      setMode("bot");
    }
  };

  /*
   * Restore an unfinished conversation — from the ACCOUNT first.
   *
   * The token lives in one browser. Starting on a laptop and opening the
   * phone used to lose the thread, and with it whatever the Secretary had
   * already answered. The account is the durable handle now.
   */
  useEffect(() => {
    // Wait for the answer before acting on it.
    if (sessionLoading) return;

    if (!isResident) {
      // Signed out: nothing of theirs to restore, and the desk is closed to
      // them until they sign back in.
      if (mode === "live") setMode("bot");
      return;
    }

    void api
      .get("/chat/mine")
      .then((response) => {
        const { session_token, conversation, messages: thread, past_conversations }
          = response.data.data;

        setPastCount(past_conversations ?? 0);

        if (!conversation) return;

        remember(LIVE_KEY, session_token);
        setToken(session_token);
        setLiveMessages(thread ?? []);
        setLiveStatus(conversation.status);
        setAgentName(conversation.agent_name ?? null);
        setQueuePosition(conversation.queue_position ?? null);
        setQueueTotal(conversation.queue_total ?? 0);
        setMode("live");
      })
      .catch(() => {
        // No conversation, or the desk is unreachable — the bot still works.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResident, sessionLoading]);

  // Poll while the panel is open and the conversation is still running.
  useEffect(() => {
    if (mode !== "live" || !token || !open || liveStatus === "Closed") return;
    const id = setInterval(() => void refreshLive(token), LIVE_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token, open, liveStatus]);

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
            // A bot that cannot answer should offer the person who can.
            buttons: [{ title: "Talk to the Secretary", payload: "__live__" }],
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
            buttons: [{ title: "Talk to the Secretary", payload: "__live__" }],
          },
        ];
      }
    }
  };

  const send = async (text: string, display?: string) => {
    const clean = text.trim();
    if (!clean || typing) return;

    // The handoff button is a payload, not a question for the bot.
    if (clean === "__live__") {
      startHandoff();
      return;
    }

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
    if (mode === "live") {
      void sendLive();
      return;
    }
    void send(input);
  };

  /**
   * Opens the step before queueing for the Secretary.
   *
   * A signed-out visitor is stopped here rather than at the end: filling in a
   * message and only then being told to sign in is how a person gives up.
   */
  const startHandoff = () => {
    setLiveError("");

    if (!isResident) {
      setMode("signin");
      return;
    }

    // Carry the last thing they typed into the form — it is usually the thing
    // they wanted a human for, and retyping it is a small insult.
    const lastUser = [...messages].reverse().find((m) => m.from === "user");
    setFirstMessage(lastUser?.text ?? "");
    setMode("form");
  };

  const startLive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firstMessage.trim()) return;
    setStarting(true);
    setLiveError("");
    try {
      // No name, no email: the account already carries both, and asking a
      // resident to retype what the barangay registered them with is the
      // kind of small insult that makes people give up on a form.
      const response = await api.post("/chat/start", {
        message: firstMessage.trim(),
      });
      const { session_token, conversation } = response.data.data;
      remember(LIVE_KEY, session_token);
      setToken(session_token);
      setLiveStatus(conversation.status);
      setQueuePosition(conversation.queue_position ?? null);
      setQueueTotal(conversation.queue_total ?? 0);
      setMode("live");
      lastSeenId.current = 0;
      await refreshLive(session_token);
    } catch {
      setLiveError("We could not reach the barangay just now. Please try again in a moment.");
    } finally {
      setStarting(false);
    }
  };

  const sendLive = async () => {
    const body = input.trim();
    if (!body || !token) return;
    setInput("");
    // Show it straight away; the poll will replace it with the stored row.
    setLiveMessages((prev) => [
      ...prev,
      { id: -Date.now(), sender: "visitor", body, created_at: new Date().toISOString() },
    ]);
    try {
      await api.post(`/chat/${token}/messages`, { body });
      await refreshLive(token);
    } catch {
      setLiveError("That message did not send. Check your connection and try again.");
    }
  };

  /** What the office issues, fetched when the resident asks to request one. */
  const openRequest = async () => {
    setPicking(true);
    setChosen(null);
    setPurpose("");

    if (services.length === 0) {
      try {
        const response = await api.get("/portal/certificate-services");
        setServices(response.data.data ?? []);
      } catch {
        setServices([]);
      }
    }
  };

  /**
   * Files it.
   *
   * The portal's own endpoint, not a second one written for the chat —
   * so the request lands in My Requests, raises the same pending
   * certificate, and reaches the same clerk's worklist. The token goes with
   * it only when a Secretary is actually on the conversation, so they see
   * what was asked for while they are still helping.
   */
  const fileRequest = async () => {
    if (!chosen || !purpose.trim()) return;

    setFiling(true);

    try {
      const response = await api.post("/portal/requests", {
        service_type: chosen.certificate_type,
        purpose: purpose.trim(),
        ...(mode === "live" && token && liveStatus !== "Closed"
          ? { session_token: token }
          : {}),
      });

      const number = response.data.data?.request_number ?? "";

      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          from: "bot",
          text:
            `Your request for a ${chosen.certificate_type} is in — ${number}. ` +
            `It is now under My Requests, and the office will start on it.` +
            (chosen.requirements.length
              ? `\n\nBring with you:\n${chosen.requirements.map((r) => `• ${r}`).join("\n")}`
              : "") +
            (chosen.fee > 0 ? `\n\nFee: P${chosen.fee.toFixed(2)}` : ""),
        },
      ]);

      if (mode === "live" && token) void refreshLive(token);

      setPicking(false);
      setChosen(null);
      setPurpose("");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: nextId++, from: "bot" as const, text: errorMessage(err) },
      ]);
    } finally {
      setFiling(false);
    }
  };

  /** The list, fetched only when the resident asks for it. */
  const loadPast = async () => {
    try {
      const response = await api.get("/chat/history");
      const rows: PastConversation[] = response.data.data.conversations ?? [];

      // Only the finished ones: the open conversation is already on screen.
      setPast(rows.filter((row) => row.status === "Closed"));
    } catch {
      setPast([]);
    }
  };

  /**
   * Opens a resolved thread, read-only.
   *
   * The same endpoint the live view uses — a closed conversation is still
   * the resident's to read, so nothing special is needed to fetch it. What
   * is special is that it cannot be replied to: it is a record of what was
   * said, not a way to say more.
   */
  const readPast = async (row: PastConversation) => {
    setReading(row);
    setReadingMessages([]);

    try {
      const response = await api.get(`/chat/${row.session_token}`);
      setReadingMessages(response.data.data.messages ?? []);
    } catch {
      setReadingMessages([]);
    }
  };

  /**
   * Reopen a finished conversation with one more question.
   *
   * On success the widget moves into the live view on THAT thread, so the
   * answer and the follow-up are read together — which is the whole point of
   * reopening rather than starting again.
   */
  const sendFollowUp = async () => {
    const body = followUpText.trim();
    if (!body || !followUpFor) return;

    setSendingFollowUp(true);

    try {
      await api.post(`/chat/${followUpFor}/follow-up`, { body });

      remember(LIVE_KEY, followUpFor);
      setToken(followUpFor);
      setLiveStatus("Waiting");
      setMode("live");
      setReading(null);
      setShowPast(false);
      setFollowUpFor(null);
      setFollowUpText("");
      lastSeenId.current = 0;
      await refreshLive(followUpFor);
    } catch {
      setLiveError("That follow-up did not send. Check your connection and try again.");
    } finally {
      setSendingFollowUp(false);
    }
  };

  /** The box, shared by the live view and the reader. */
  const followUpBox = (sessionToken: string) =>
    followUpFor === sessionToken ? (
      <div className="space-y-2">
        <textarea
          rows={3}
          autoFocus
          value={followUpText}
          onChange={(e) => setFollowUpText(e.target.value)}
          placeholder="What else would you like to ask?"
          maxLength={2000}
          className="w-full rounded-xl border border-gray px-3 py-2 text-xs text-dark outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => { setFollowUpFor(null); setFollowUpText(""); }}
            className="cursor-pointer rounded-full border border-gray px-3 py-1.5 text-xs font-semibold text-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={sendFollowUp}
            disabled={!followUpText.trim() || sendingFollowUp}
            className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {sendingFollowUp ? "Sending…" : "Send follow-up"}
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => { setFollowUpFor(sessionToken); setFollowUpText(""); }}
        className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
      >
        Ask a follow-up
      </button>
    );

  const endLive = async () => {
    if (token) {
      try {
        await api.post(`/chat/${token}/end`);
      } catch {
        /* closing is best-effort — the local session ends either way */
      }
    }
    remember(LIVE_KEY, null);
    setToken(null);
    setLiveMessages([]);
    setAgentName(null);
    setLiveStatus("Waiting");
    lastSeenId.current = 0;
    setMode("bot");
  };

  const headerSubtitle =
    mode === "live"
      ? liveStatus === "Closed"
        ? "Conversation ended"
        : agentName
          ? `${agentName} is with you`
          : "Waiting for the Barangay Secretary…"
      : mode === "form"
        ? "Connecting you to a person"
        : mode === "signin"
          ? "Sign in to reach the Secretary"
          : "Online — ask me anything";

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
              <p className="truncate text-sm font-bold text-white">
                {mode === "bot" ? "Natumolan Assistant" : "Barangay Secretary"}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-white/80">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2 w-2 rounded-full ${
                    mode === "live" && liveStatus === "Waiting"
                      ? "animate-pulse bg-warning"
                      : mode === "live" && liveStatus === "Closed"
                        ? "bg-white/50"
                        : "bg-success"
                  }`}
                />
                <span className="truncate">{headerSubtitle}</span>
              </p>
            </div>
            {/*
              Earlier conversations, reached from the header.

              This sat at the top of the message thread, where it did two
              wrong things at once: it pushed the conversation down, and it
              scrolled away the moment anybody said anything. The header is
              always there and costs no room in the thread.
            */}
            {isResident && pastCount > 0 && mode !== "live" && (
              <button
                type="button"
                onClick={() => {
                  setShowPast(!showPast);
                  setReading(null);
                  if (!showPast) void loadPast();
                }}
                aria-label="Your earlier conversations"
                title="Your earlier conversations"
                className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/15 hover:text-white ${
                  showPast ? "bg-white/20 text-white" : "text-white/80"
                }`}
              >
                <FiClock className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                  {pastCount}
                </span>
              </button>
            )}
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

          {/* Body */}
          {mode === "signin" ? (
            /*
              The desk is one Secretary at a time, so the queue is only as
              useful as it is short. Keeping it to registered residents is
              what makes a queue number mean anything — and it means whoever
              is answered can actually be looked up, and reached afterwards.
            */
            <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/60 px-4 py-4">
              <p className="rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-dark shadow-sm">
                Talking to the <strong>Barangay Secretary</strong> needs your resident portal
                account. Signing in means they can see your record while they help you — and you
                will not be asked to type your name, email or number.
              </p>
              <p className="rounded-xl bg-secondary px-4 py-2.5 text-xs leading-relaxed text-gray-500">
                No account yet? The Population Office creates one when you are registered as a
                resident, and it is activated with a code sent to your email.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("bot")}
                  className="flex-1 cursor-pointer rounded-full border border-gray bg-white py-2.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  Back to the assistant
                </button>
                <Link
                  to="/login"
                  className="flex-1 cursor-pointer rounded-full bg-primary py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Sign in
                </Link>
              </div>
            </div>
          ) : mode === "form" ? (
            /* Who are you, and what do you need? Kept to three fields — the
               person is already frustrated enough to want a human. */
            <form onSubmit={startLive} className="flex-1 space-y-3 overflow-y-auto bg-secondary/60 px-4 py-4">
              <p className="rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-dark shadow-sm">
                I&rsquo;ll pass you to the <strong>Barangay Secretary</strong> — office hours are
                Mon–Fri, 8:00 AM–5:00 PM.
              </p>
              {liveError && (
                <p className="rounded-xl bg-danger/10 px-4 py-2.5 text-xs font-medium text-danger">{liveError}</p>
              )}
              {/*
                Nothing is asked about who they are. They are signed in, so the
                barangay already has their name, their purok and their number —
                and the Secretary sees all three when the chat arrives.
              */}
              <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
                Signed in as <strong>{user?.name}</strong>. The Secretary will see your resident
                record, so there is nothing else to fill in.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-dark">How can we help?</span>
                <textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  required
                  rows={3}
                  placeholder="Describe what you need…"
                  className="w-full rounded-xl border border-gray bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("bot")}
                  className="flex-1 cursor-pointer rounded-full border border-gray bg-white py-2.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  Back to the assistant
                </button>
                <button
                  type="submit"
                  disabled={starting || !firstMessage.trim()}
                  className="flex-1 cursor-pointer rounded-full bg-primary py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {starting ? "Connecting…" : "Start the chat"}
                </button>
              </div>
            </form>
          ) : picking ? (
            /*
              Requesting a certificate, as a panel of its own.

              It was a strip wedged between the thread and the buttons, which
              left it about eighty pixels tall — the requirements, the fee,
              the purpose box and the send button all fighting for a space
              none of them fitted in. A form nobody can read is a form nobody
              fills in correctly.
            */
            <div className="flex-1 overflow-y-auto bg-secondary/60 px-4 py-4">
              <button
                type="button"
                onClick={() => { setPicking(false); setChosen(null); }}
                className="mb-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                &larr; Back to the assistant
              </button>

              {!chosen ? (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-dark">What do you need?</p>
                  <p className="mb-1 text-xs leading-relaxed text-gray-500">
                    Pick one and it will tell you what to bring before you send it.
                  </p>

                  {services.length === 0 ? (
                    <div aria-hidden="true" className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <span key={i} className="block h-11 animate-pulse rounded-xl bg-gray" />
                      ))}
                    </div>
                  ) : (
                    services.map((service) => (
                      <button
                        key={service.certificate_type}
                        type="button"
                        onClick={() => setChosen(service)}
                        className="block w-full cursor-pointer rounded-xl border border-gray bg-white px-4 py-3 text-left transition-colors hover:border-primary"
                      >
                        <p className="text-sm font-medium text-dark">{service.certificate_type}</p>
                        {service.fee > 0 && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            Fee: P{service.fee.toFixed(2)}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-dark">{chosen.certificate_type}</p>
                    <button
                      type="button"
                      onClick={() => setChosen(null)}
                      className="shrink-0 cursor-pointer text-xs font-semibold text-gray-400 hover:text-dark"
                    >
                      Change
                    </button>
                  </div>

                  {/*
                    What to bring, BEFORE they commit — not after. A resident
                    who learns at the counter that they needed a valid ID has
                    made the trip for nothing.
                  */}
                  {chosen.requirements.length > 0 && (
                    <div className="rounded-xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-dark">Bring with you:</p>
                      <ul className="mt-1.5 space-y-1">
                        {chosen.requirements.map((need) => (
                          <li key={need} className="text-xs leading-relaxed text-gray-600">
                            • {need}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {chosen.fee > 0 && (
                    <p className="text-xs text-gray-500">
                      Fee: <strong className="text-dark">P{chosen.fee.toFixed(2)}</strong>
                    </p>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-dark">
                      What is it for?
                    </span>
                    <input
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="e.g. employment, school, loan"
                      maxLength={500}
                      className="w-full rounded-xl border border-gray bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={filing || !purpose.trim()}
                    onClick={() => void fileRequest()}
                    className="w-full cursor-pointer rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                  >
                    {filing ? "Sending…" : "Send this request"}
                  </button>
                </div>
              )}
            </div>
          ) : showPast && !reading ? (
            /*
              The list, as a panel of its own rather than a block inside the
              thread — so it covers nothing and needs no scrolling to find.
              Labelled by what the resident opened with, because a column of
              dates says nothing about which one was about the clearance.
            */
            <div className="flex-1 overflow-y-auto bg-secondary/60 px-4 py-4">
              <button
                type="button"
                onClick={() => setShowPast(false)}
                className="mb-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                &larr; Back to the assistant
              </button>

              <p className="mb-2 text-xs font-bold text-dark">Your conversations</p>

              {past.length === 0 ? (
                <div aria-hidden="true" className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <span key={i} className="block h-9 animate-pulse rounded-xl bg-gray" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {past.map((row) => (
                    <button
                      key={row.session_token}
                      type="button"
                      onClick={() => void readPast(row)}
                      className="block w-full cursor-pointer rounded-xl border border-gray bg-white px-3 py-2 text-left transition-colors hover:border-primary"
                    >
                      <p className="truncate text-xs font-medium text-dark">
                        {row.opening || "Conversation with the barangay"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {row.closed_at
                          ? new Date(row.closed_at).toLocaleDateString("en-PH", { dateStyle: "medium" })
                          : ""}
                        {row.agent_name ? ` · ${row.agent_name}` : ""}
                        {` · ${row.messages} message${row.messages === 1 ? "" : "s"}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : reading ? (
            /*
              A resolved conversation, read back.

              Read-only on purpose: it is a record of what was said, not a way
              to say more. Somebody who needs to ask again starts a new one,
              which is what the desk expects and what keeps the two threads
              from being confused for one.
            */
            <div className="flex-1 overflow-y-auto bg-secondary/60 px-4 py-4">
              <button
                type="button"
                onClick={() => { setReading(null); setReadingMessages([]); setShowPast(true); }}
                className="mb-3 cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                &larr; Back to your conversations
              </button>

              <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                {reading.agent_name
                  ? `Answered by ${reading.agent_name}`
                  : "From the barangay desk"}
                {reading.closed_at
                  ? ` · resolved ${new Date(reading.closed_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}`
                  : ""}
              </p>

              <div className="space-y-3">
                {readingMessages.map((message) => (
                  <div key={message.id}>
                    {message.sender === "system" ? (
                      <p className="mx-auto w-fit max-w-[90%] rounded-full bg-white/70 px-3 py-1 text-center text-[11px] text-gray-500">
                        {message.body}
                      </p>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                          message.sender === "visitor"
                            ? "ml-auto bg-primary text-white"
                            : "bg-white text-dark"
                        }`}
                      >
                        {message.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/*
                The same offer, on an older thread. A resident reading back
                through what they were told is exactly the person who realises
                they have one more question.
              */}
              {reading.status === "Closed" && (
                <div className="mt-4 space-y-2 rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                  <p className="text-xs text-gray-500">
                    Still need something on this? Ask here and the desk picks up
                    the same conversation.
                  </p>
                  {followUpBox(reading.session_token)}
                </div>
              )}
            </div>
          ) : (            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-secondary/60 px-4 py-4">
              {mode === "live" ? (
                <>
                  {liveStatus === "Waiting" && (
                    <p className="rounded-2xl bg-warning/15 px-4 py-2.5 text-xs leading-relaxed text-dark">
                      You are in the queue. The Barangay Secretary will join shortly — you can keep
                      typing in the meantime, and everything you send will be waiting for them.
                    </p>
                  )}
                  {liveMessages.map((message) => (
                    <div key={message.id}>
                      {message.sender === "system" ? (
                        <p className="mx-auto w-fit max-w-[90%] rounded-full bg-white/70 px-3 py-1 text-center text-[11px] text-gray-500">
                          {message.body}
                        </p>
                      ) : (
                        <div
                          className={
                            message.sender === "visitor"
                              ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white"
                              : "w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-dark shadow-sm"
                          }
                        >
                          {message.sender === "agent" && message.sender_name && (
                            <span className="mb-0.5 block text-[11px] font-semibold text-primary">
                              {message.sender_name}
                            </span>
                          )}
                          {message.body}
                        </div>
                      )}
                    </div>
                  ))}
                  {liveStatus === "Closed" && (
                    <div className="space-y-2 rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                      <p className="text-xs text-gray-500">
                        This conversation has ended. If something is still unclear you
                        can ask here — it goes back to the same desk with everything
                        already said.
                      </p>
                      {token && followUpBox(token)}
                      {followUpFor !== token && (
                        <button
                          type="button"
                          onClick={endLive}
                          className="block w-full cursor-pointer text-xs font-medium text-gray-500 hover:text-primary"
                        >
                          Back to the assistant
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}

          {isResident && !picking && !showPast && !reading && liveStatus !== "Closed" && (
            <button
              type="button"
              onClick={() => void openRequest()}
              className="flex cursor-pointer items-center justify-center gap-2 border-t border-gray bg-white px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
            >
              <FiFileText className="h-4 w-4" aria-hidden="true" />
              Request a certificate
            </button>
          )}

          {/* Handoff / end bar */}
          {mode === "bot" && !picking && !showPast && !reading && (
            <button
              type="button"
              onClick={startHandoff}
              className="flex cursor-pointer items-center justify-center gap-2 border-t border-gray bg-white px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
            >
              <FiHeadphones className="h-4 w-4" aria-hidden="true" />
              Talk to the Secretary (live agent)
            </button>
          )}
          {/*
            Where they stand. "Waiting" on its own tells somebody nothing
            about whether to keep the tab open or come back later; a position
            and a total tell them exactly that.
          */}
          {mode === "live" && liveStatus === "Waiting" && queuePosition !== null && (
            <div className="border-t border-gray bg-warning/10 px-4 py-2.5">
              <p className="text-xs font-semibold text-dark">
                {queuePosition === 1
                  ? "You are next — the Secretary will be with you shortly."
                  : `You are number ${queuePosition} in the queue.`}
              </p>
              {queueTotal > 1 && (
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {queuePosition === 1
                    ? `${queueTotal} waiting in total.`
                    : `${queuePosition - 1} ${queuePosition - 1 === 1 ? "person is" : "people are"} ahead of you.`}{" "}
                  The desk answers one person at a time. You can keep typing — your messages are
                  saved, and you will be notified when the Secretary joins.
                </p>
              )}
            </div>
          )}

          {mode === "live" && liveStatus !== "Closed" && (
            <button
              type="button"
              onClick={endLive}
              className="cursor-pointer border-t border-gray bg-white px-4 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-danger"
            >
              End this conversation
            </button>
          )}

          {/*
            Input, hidden while a form or a past conversation is open.

            Nothing typed there would go anywhere useful — the request panel
            has its own box, and a resolved thread cannot be replied to — and
            a composer that looks live but is not is worse than no composer.
          */}
          {mode !== "form" && mode !== "signin" && !picking && !showPast && !reading && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-gray bg-white px-3 py-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "live"
                    ? liveStatus === "Closed"
                      ? "This conversation has ended"
                      : "Message the Secretary…"
                    : "Type your question…"
                }
                aria-label={mode === "live" ? "Message the Secretary" : "Type your question"}
                disabled={mode === "live" && liveStatus === "Closed"}
                className="flex-1 rounded-full border border-gray bg-secondary/60 px-4 py-2.5 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!input.trim() || typing || (mode === "live" && liveStatus === "Closed")}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiSend className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      )}

      {/*
        What the button IS, in words.

        Sits in its own fixed box the same height as the launcher, so it stays
        vertically centred against it whether it is showing three dots or two
        lines of text — and the box ignores pointer events, so the page
        underneath is still clickable everywhere except the bubble.
      */}
      {hint && !open && (
        <div className="pointer-events-none fixed bottom-5 right-4 z-50 flex h-14 items-center pr-[4.25rem] sm:right-6">
          <button
            type="button"
            onClick={() => {
              /* No dismissal here any more: opening hides the bubble through
                 `!open`, and closing arms it again. */
              setOpen(true);
              void ensureNotifyPermission();
            }}
            /*
              A fixed label, and no live region. The words in the bubble
              rotate to catch an eye; announcing all three on a loop to
              somebody using a screen reader would be noise, and the button
              still only does the one thing.
            */
            aria-label="Chat with the barangay assistant"
            className="chat-hint pointer-events-auto relative flex min-h-[2.75rem] max-w-[11rem] cursor-pointer items-center rounded-2xl bg-dark px-4 py-2.5 text-left text-sm font-medium leading-snug text-white shadow-xl sm:max-w-[15rem]"
          >
            {thinking ? (
              /* Three dots, the way a chat says it is about to speak. */
              <span aria-hidden="true" className="flex items-center gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="chat-dot h-1.5 w-1.5 rounded-full bg-white"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
            ) : (
              <span aria-hidden="true">
                {typed}
                {/* The caret stops the moment the line is finished, so a
                    resting sentence does not look like it is still being
                    written. */}
                {typed.length < HINT_LINES[line].length && (
                  <span className="chat-caret ml-0.5 font-normal">|</span>
                )}
              </span>
            )}

            {/* The tail, pointing at the button. */}
            <span
              aria-hidden="true"
              className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-dark"
            />
          </button>
        </div>
      )}

      {/* Floating launcher — bottom right */}
      <button
        type="button"
        aria-label={open ? "Close the barangay assistant" : "Chat with the barangay assistant"}
        onClick={() => {
          /* The bubble follows `open` on its own now — hidden while the panel
             is up, back a beat after it closes. */
          setOpen((o) => !o);
          // Opening the chat is a good moment to ask for desktop-alert
          // permission (a user gesture) — enables reply popups when tabbed away.
          void ensureNotifyPermission();
        }}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/40 transition-all duration-300 hover:scale-110 hover:bg-primary-dark sm:right-6"
      >
        {open ? <FiX className="h-6 w-6" /> : <FiMessageCircle className="h-6 w-6" />}
        {!open && (
          // `animate-ping` (scale 2) reached past the screen edge and gave the
          // whole page a sideways scroll — see `ping-contained` in index.css.
          <span
            aria-hidden="true"
            className="animate-ping-contained absolute inset-0 -z-10 rounded-full bg-primary/40"
          />
        )}
      </button>
    </>
  );
}
