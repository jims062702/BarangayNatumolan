import { useRef } from "react";
import { FiCheckCircle, FiPaperclip, FiX } from "react-icons/fi";

/**
 * A file chooser that says what it has, and how far it has got.
 *
 * The browser's own control says "No file chosen" and then the file's name,
 * and nothing else ever — no size, no progress, no confirmation. On a slow
 * connection that leaves somebody who has pressed Save with no way to tell a
 * large upload from a dead one.
 */

const KB = 1024;

/** "2.4 MB" — the number somebody can compare against "up to 5MB". */
function readableSize(bytes: number) {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(0)} KB`;

  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

export default function FileField({
  file,
  onPick,
  accept = "image/*",
  /** 0–100, -1 for a length nobody knows, or null when nothing is uploading. */
  progress = null,
  done = false,
  disabled = false,
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  accept?: string;
  progress?: number | null;
  done?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const busy = progress !== null && !done;

  const clear = () => {
    onPick(null);
    /* The DOM input keeps its own value, so a file cleared here would still
       be listed by the browser and could be submitted again. */
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled || busy}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="block w-full cursor-pointer text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary disabled:opacity-60"
      />

      {file && (
        <div className="rounded-xl border border-gray bg-secondary/60 px-3 py-2">
          <div className="flex items-center gap-2">
            {done ? (
              <FiCheckCircle className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <FiPaperclip className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            )}

            <span className="min-w-0 flex-1 truncate text-xs font-medium text-dark">
              {file.name}
            </span>

            <span className="shrink-0 text-[11px] text-gray-500">
              {readableSize(file.size)}
            </span>

            {/* Removing a file mid-upload would leave the request running
                against something the form no longer has. */}
            {!busy && !done && (
              <button
                type="button"
                onClick={clear}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 cursor-pointer rounded-full p-1 text-gray-400 transition hover:bg-danger/10 hover:text-danger"
              >
                <FiX className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {(busy || done) && (
            <div className="mt-2">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-gray"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                /* An indeterminate bar has no value to announce, and giving it
                   one would be inventing a number. */
                aria-valuenow={progress !== null && progress >= 0 ? progress : undefined}
                aria-label="Upload progress"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    done ? "bg-success" : "bg-primary"
                  } ${progress === -1 ? "animate-pulse" : ""}`}
                  style={{ width: progress === -1 ? "100%" : `${progress ?? 0}%` }}
                />
              </div>

              <p
                aria-live="polite"
                className={`mt-1 text-[11px] font-medium ${done ? "text-success" : "text-gray-500"}`}
              >
                {done
                  ? "Uploaded"
                  : progress === -1
                    ? "Uploading…"
                    : progress === 100
                      ? "Finishing up…"
                      : `Uploading… ${progress}%`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
