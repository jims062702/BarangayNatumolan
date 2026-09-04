import { useEffect, useMemo, useRef, useState } from "react";
import { FiCornerUpLeft } from "react-icons/fi";

/**
 * The Secretary's reply box, with the canned answers one keystroke away.
 *
 * Typing `@` opens the list; typing more narrows it. Picking one drops the
 * REAL text — the requirements the office publishes, the name on the current
 * roster — into the box, where it can still be edited before it is sent.
 *
 * The list is what makes this usable. A shortcut nobody can remember is
 * slower than typing the answer, so nothing here has to be memorised: press
 * `@`, read, choose. The slug is shown beside each entry so the ones used
 * every day get learned on their own, without ever being required.
 */

export interface Shortcut {
  slug: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  body: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  shortcuts: Shortcut[];
  disabled?: boolean;
}

/** How many rows the box may grow to before it scrolls instead. */
const MAX_ROWS = 10;

/**
 * The `@token` the caret is sitting in, or null.
 *
 * The `@` only counts at the start of a word — an email address in the middle
 * of a sentence must not open a menu — and any whitespace after it closes the
 * token, because the expansions themselves contain spaces.
 */
function activeToken(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");

  if (at === -1) return null;

  const preceding = at === 0 ? "" : before[at - 1];
  if (preceding && !/\s/.test(preceding)) return null;

  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;

  return { start: at, query };
}

export default function ShortcutComposer({
  value,
  onChange,
  onSend,
  sending,
  shortcuts,
  disabled = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  /** Every word of the query must appear somewhere in the entry. */
  const matches = useMemo(() => {
    if (!token) return [];

    const words = token.query.toLowerCase().split(/[\s/]+/).filter(Boolean);

    return shortcuts
      .filter((shortcut) => {
        const haystack = `${shortcut.slug} ${shortcut.label} ${shortcut.keywords ?? ""}`
          .toLowerCase()
          .replace(/[^a-z0-9\s/-]/g, " ");

        return words.every((word) => haystack.includes(word));
      })
      .slice(0, 40);
  }, [shortcuts, token]);

  const open = token !== null && matches.length > 0;

  // A narrowed list must never leave the highlight pointing off the end.
  useEffect(() => {
    setHighlighted(0);
  }, [token?.query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  /*
   * The box grows with what is in it. An expansion is a dozen lines, and two
   * fixed rows meant the Secretary sent text they could not see.
   */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_ROWS)}px`;
  }, [value]);

  const syncToken = () => {
    const el = textareaRef.current;
    if (!el) return;
    setToken(activeToken(el.value, el.selectionStart ?? el.value.length));
  };

  /** Swaps the `@token` for the real text and puts the caret after it. */
  const choose = (shortcut: Shortcut) => {
    const el = textareaRef.current;
    if (!el || !token) return;

    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, token.start);
    const after = value.slice(caret);
    // A space so the next sentence does not run into the expansion, unless
    // one is already there.
    const tail = after.startsWith(" ") || after.startsWith("\n") ? "" : " ";
    const next = before + shortcut.body + tail + after;

    onChange(next);
    setToken(null);

    const at = before.length + shortcut.body.length + tail.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      /*
       * While the menu is up it owns these keys. Enter picking an entry
       * rather than sending is the whole point — otherwise choosing a
       * shortcut would fire off a half-written reply.
       */
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(matches[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setToken(null);
        return;
      }
    }

    // Enter sends; Shift+Enter is a new line — what people expect from every
    // other chat they have ever used.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !sending) onSend();
    }
  };

  let lastGroup = "";

  return (
    <div className="relative mt-3">
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Insert a saved answer"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-gray bg-white p-1.5 shadow-2xl sm:w-[32rem]"
        >
          {matches.map((shortcut, index) => {
            const header = shortcut.group !== lastGroup ? shortcut.group : null;
            lastGroup = shortcut.group;

            return (
              <div key={shortcut.slug}>
                {header && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  // mousedown, not click: the textarea must not lose focus
                  // before the insertion happens.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(shortcut);
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    index === highlighted ? "bg-primary text-white" : "hover:bg-secondary"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{shortcut.label}</span>
                    {shortcut.hint && (
                      <span
                        className={`block truncate text-[11px] ${
                          index === highlighted ? "text-white/75" : "text-gray-400"
                        }`}
                      >
                        {shortcut.hint}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[11px] ${
                      index === highlighted ? "text-white/75" : "text-gray-400"
                    }`}
                  >
                    @{shortcut.slug}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {token !== null && matches.length === 0 && (
        <p className="absolute bottom-full left-0 z-20 mb-2 rounded-xl border border-gray bg-white px-4 py-2.5 text-xs text-gray-500 shadow-lg">
          Nothing matches &ldquo;{token.query}&rdquo;. Press Esc to carry on typing.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !sending) onSend();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(syncToken);
          }}
          onKeyUp={syncToken}
          onClick={syncToken}
          onBlur={() => setToken(null)}
          disabled={disabled}
          rows={2}
          placeholder="Type your reply — or @ for saved answers (Enter to send, Shift+Enter for a new line)"
          aria-label="Reply to this conversation"
          className="flex-1 resize-none rounded-xl border border-gray bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={!value.trim() || sending}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          <FiCornerUpLeft className="h-4 w-4" aria-hidden="true" />
          {sending ? "Sending…" : "Reply"}
        </button>
      </form>
    </div>
  );
}
