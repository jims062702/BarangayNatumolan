import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiUser } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import ShortcutComposer, { type Shortcut } from "../../components/chat/ShortcutComposer";
import { toast } from "../../lib/toast";
import { useAuth } from "../../contexts/AuthContext";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { playNotificationSound } from "../../lib/sound";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import type { ChatConversation, ChatMessage } from "../../types";
import { RowsSkeleton } from "../../components/UI/Skeleton";

/**
 * The live chat desk — the Barangay Secretary's page.
 *
 * A two-pane inbox: everyone waiting on the left, the open conversation on the
 * right. It refreshes on a timer rather than a socket, matching the widget on
 * the public site.
 */

/** Faster than the usual staff cadence: someone is sitting there waiting. */
const THREAD_POLL_MS = 4000;

const timeOf = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "";

/** "3m ago" — how long this person has been waiting, at a glance. */
function waitedFor(since?: string | null): string {
  if (!since) return "";
  const minutes = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function LiveChat() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [filter, setFilter] = useState<"open" | "Waiting" | "Closed">("open");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  /*
   * The canned answers behind @certificate/… and @officials/…. Fetched once
   * per visit rather than per keystroke: the roster and the service guides
   * change a few times a year, and the desk needs the menu to open instantly.
   */
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  /*
   * The one conversation this agent is in, if any. The desk is one Secretary
   * answering one person at a time — two threads at once means both visitors
   * get half an answer slowly, and the queue behind them hears nothing.
   */
  const [busyWith, setBusyWith] = useState<{ id: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Rings only when the number of people waiting goes UP.
  const waitingRef = useRef<number | null>(null);

  const loadList = async () => {
    try {
      const response = await api.get("/chat/conversations", { params: { status: filter } });
      const rows: ChatConversation[] = response.data.data.data ?? [];
      setConversations(rows);

      // Whoever is already mine and still open. Read from the list rather
      // than a second request — it is the same data.
      const mine = rows.find((c) => c.status === "Active" && c.assigned_to === user?.id);
      setBusyWith(mine ? { id: mine.id, name: mine.visitor_name ?? "someone" } : null);

      const waiting = rows.filter((c) => c.status === "Waiting").length;
      if (waitingRef.current !== null && waiting > waitingRef.current) {
        playNotificationSound();
      }
      waitingRef.current = waiting;
    } finally {
      setLoading(false);
    }
  };

  /*
   * Loaded once, not per keystroke. A menu that waits on the network
   * every time the Secretary presses @ is slower than typing the answer,
   * which would defeat the whole point of having it.
   */
  useEffect(() => {
    void api
      .get("/chat/shortcuts")
      .then((response) => setShortcuts(response.data.data ?? []))
      // A desk that cannot reach the guides can still reply by hand.
      .catch(() => setShortcuts([]));
  }, []);

  const loadThread = async (id: number) => {
    try {
      const response = await api.get(`/chat/conversations/${id}`);
      setActive(response.data.data.conversation);
      setMessages(response.data.data.messages);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  useEffect(() => {
    setLoading(true);
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // The list keeps up on its own so a new visitor appears without a refresh.
  useAutoRefresh(() => void loadList(), REFRESH.staff, { evenWhenHidden: true });

  // The open conversation refreshes faster — someone is waiting on the reply.
  useEffect(() => {
    if (!activeId) return;
    void loadThread(activeId);
    const id = setInterval(() => void loadThread(activeId), THREAD_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const open = (conversation: ChatConversation) => {
    setActiveId(conversation.id);
    setActive(conversation);
    setMessages([]);
  };

  const claim = async () => {
    if (!active) return;
    try {
      const response = await api.post(`/chat/conversations/${active.id}/claim`);
      setActive(response.data.data);
      toast(response.data.message);
      await Promise.all([loadList(), loadThread(active.id)]);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const send = async () => {
    const body = reply.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      await api.post(`/chat/conversations/${active.id}/reply`, { body });
      setReply("");
      await Promise.all([loadThread(active.id), loadList()]);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(false);
    }
  };

  const close = async () => {
    if (!active) return;
    if (
      !(await confirmAction({
        title: "Close this conversation?",
        text: `${active.visitor_name} will be told it has been resolved.`,
        confirmText: "Yes, close it",
      }))
    )
      return;
    try {
      const response = await api.post(`/chat/conversations/${active.id}/close`);
      setActive(response.data.data);
      toast(response.data.message);
      await Promise.all([loadList(), loadThread(active.id)]);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const waiting = conversations.filter((c) => c.status === "Waiting").length;
  const closed = active?.status === "Closed";

  return (
    <div>
      <PageHeader
        title="Live Chat"
        subtitle="Residents and visitors who asked to speak to a person — the Secretary's desk"
      />

      {waiting > 0 && (
        <p className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm font-medium text-dark">
          {waiting} {waiting === 1 ? "person is" : "people are"} waiting for a reply.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* Queue */}
        <Card title="Conversations">
          <div className="mb-3 flex gap-2">
            {(
              [
                ["open", "Open"],
                ["Waiting", "Waiting"],
                ["Closed", "Closed"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === value ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/*
            The desk answers one person at a time. Saying so — with the name
            — is what stops a Secretary opening a second thread, typing a
            reply, and only then being refused by the server.
          */}
          {busyWith && (
            <p className="mb-2 rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs leading-relaxed text-dark">
              You are with <strong>{busyWith.name}</strong>. Close that conversation when you
              are done and the next person in the queue comes through.
            </p>
          )}

          {loading ? (
            <RowsSkeleton rows={5} what="the conversations" />
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Nobody is waiting. New conversations appear here on their own.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => open(conversation)}
                    className={`w-full cursor-pointer rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      activeId === conversation.id
                        ? "border-primary bg-primary/5"
                        : "border-gray hover:border-primary/40"
                    } ${
                      // Readable, still openable — the Secretary may need to
                      // see what is waiting. Replying is what is refused.
                      busyWith && busyWith.id !== conversation.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-dark">
                        {conversation.visitor_name}
                      </span>
                      {conversation.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                          {conversation.unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <StatusBadge status={conversation.status} />
                      <span className="text-[11px] text-gray-400">
                        {waitedFor(conversation.last_message_at ?? conversation.created_at)}
                      </span>
                    </div>
                    {conversation.is_resident && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                        <FiUser className="h-3 w-3" aria-hidden="true" /> Registered resident
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Thread */}
        <Card
          title={active ? active.visitor_name : "Conversation"}
          action={
            active && !closed ? (
              <div className="flex gap-2">
                {!active.assigned_to && (
                  <button
                    type="button"
                    onClick={claim}
                    className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
                  >
                    Take this chat
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray px-4 py-1.5 text-xs font-semibold text-dark hover:border-primary hover:text-primary"
                >
                  <FiCheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> Resolve
                </button>
              </div>
            ) : undefined
          }
        >
          {!active ? (
            <p className="py-16 text-center text-sm text-gray-400">
              Choose a conversation on the left to read and reply.
            </p>
          ) : (
            <>
              {/* Who you are talking to */}
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-secondary/60 px-4 py-2.5 text-xs text-gray-500">
                {active.guest_email && (
                  <span>
                    Email: <strong className="text-dark">{active.guest_email}</strong>
                  </span>
                )}
                {active.guest_contact && (
                  <span>
                    Contact: <strong className="text-dark">{active.guest_contact}</strong>
                  </span>
                )}
                <span>
                  Started: <strong className="text-dark">{waitedFor(active.created_at)}</strong>
                </span>
                {active.agent_name && (
                  <span>
                    Handled by: <strong className="text-dark">{active.agent_name}</strong>
                  </span>
                )}
              </div>

              <div
                ref={threadRef}
                className="h-[24rem] space-y-3 overflow-y-auto rounded-xl bg-secondary/40 px-4 py-4"
              >
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">Loading messages…</p>
                ) : (
                  messages.map((message) =>
                    message.sender === "system" ? (
                      <p
                        key={message.id}
                        className="mx-auto w-fit max-w-[90%] rounded-full bg-white/80 px-3 py-1 text-center text-[11px] text-gray-500"
                      >
                        {message.body}
                      </p>
                    ) : (
                      <div key={message.id}>
                        <div
                          className={
                            message.sender === "agent"
                              ? "ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white"
                              : "w-fit max-w-[80%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-dark shadow-sm"
                          }
                        >
                          {message.body}
                        </div>
                        <span
                          className={`mt-0.5 block text-[11px] text-gray-400 ${
                            message.sender === "agent" ? "text-right" : ""
                          }`}
                        >
                          {message.sender === "agent" ? message.sender_name : active.visitor_name} ·{" "}
                          {timeOf(message.created_at)}
                        </span>
                      </div>
                    )
                  )
                )}
              </div>

              {closed ? (
                <p className="mt-3 rounded-xl bg-secondary px-4 py-3 text-center text-sm text-gray-500">
                  This conversation is closed. The visitor can start a new one from the website.
                </p>
              ) : (
                <ShortcutComposer
                  value={reply}
                  onChange={setReply}
                  onSend={() => void send()}
                  sending={sending}
                  shortcuts={shortcuts}
                />
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
