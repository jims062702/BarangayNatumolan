import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiClock } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { idleFor, markActive, watchActivity } from "../hooks/useActivity";

/**
 * Signs somebody out after three hours of doing nothing, having warned them.
 *
 * The server is the actual boundary — it refuses a token that has not been
 * used for three hours, whatever the browser believes. This is the courteous
 * half: without it the first thing a person does after lunch is press a
 * button, get a silent 401 and land on the login page with whatever they had
 * typed gone.
 *
 * Two minutes is enough to notice a dialogue and press a button, and short
 * enough that it is not simply a fourth hour by another name.
 */

const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;
const WARN_BEFORE_MS = 2 * 60 * 1000;

/* Checked on a slow tick: the clock this reads is in localStorage, and there
   is nothing to be gained from asking about it more often than the countdown
   changes. */
const CHECK_EVERY_MS = 15 * 1000;

export default function IdleSignOut() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  /* So the sign-out cannot be started twice by two overlapping ticks. */
  const goingRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    watchActivity();
    goingRef.current = false;

    const tick = async () => {
      const idle = idleFor();

      if (idle >= IDLE_LIMIT_MS) {
        if (goingRef.current) return;

        goingRef.current = true;
        setSecondsLeft(null);
        await logout();
        /* A resident lands on the public site, staff at the sign-in form —
           the same destinations the sign-out button uses. */
        navigate(user.role === "Resident" ? "/" : "/login");

        return;
      }

      setSecondsLeft(
        idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS
          ? Math.max(0, Math.round((IDLE_LIMIT_MS - idle) / 1000))
          : null,
      );
    };

    void tick();

    const id = window.setInterval(tick, CHECK_EVERY_MS);

    return () => window.clearInterval(id);
  }, [user, logout, navigate]);

  if (!user || secondsLeft === null) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    /*
     * Not a modal. A modal would take the keyboard away from somebody who is
     * mid-sentence, and typing is itself the activity that should cancel this.
     */
    <div
      role="status"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(92vw,26rem)] -translate-x-1/2 rounded-2xl border border-warning/40 bg-white p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-xl bg-warning/15 p-2 text-amber-700">
          <FiClock className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dark">
            Signing you out in {minutes > 0 ? `${minutes}m ` : ""}
            {seconds}s
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            There has been no activity for nearly three hours. Anything typed
            but not saved will be lost.
          </p>

          <button
            type="button"
            onClick={() => {
              markActive();
              setSecondsLeft(null);
            }}
            className="mt-3 w-full cursor-pointer rounded-full bg-primary py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            I&apos;m still here
          </button>
        </div>
      </div>
    </div>
  );
}
