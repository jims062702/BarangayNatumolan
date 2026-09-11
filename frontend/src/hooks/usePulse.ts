import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { idleFor, watchActivity } from "./useActivity";

/**
 * Sees a change about a second after it happens, instead of up to thirty.
 *
 * Every page used to answer "has anything changed?" by re-fetching its whole
 * list on a timer — twelve seconds for a work queue, thirty for the portal —
 * so a clerk saw a colleague's entry long after it was made.
 *
 * The question is now separate from the answer. One tiny request asks the
 * server for a counter per kind of record; the expensive fetch runs only when
 * a counter a page cares about has moved.
 *
 * ONE poller for the whole application, not one per page. A dashboard with
 * four subscribed panels makes one request a second between them, not four.
 */

const INTERVAL_MS = 1000;

/*
 * How long a person may sit still before the pulse stops.
 *
 * Not politeness — necessity. The server signs out a token that has not been
 * used for three hours, and a poll running once a second on an abandoned tab
 * would keep that token alive for ever. The idle clock only starts when the
 * app stops talking on the person's behalf.
 */
const PAUSE_AFTER_IDLE_MS = 2 * 60 * 1000;

/**
 * The topics the server keeps counters for.
 *
 * A page names the kind of record it is watching, and every model that could
 * change what that page shows moves the same counter — see the map in
 * AppServiceProvider.
 */
export type PulseTopic =
  | "residents" | "households" | "certificates" | "service_requests"
  | "appointments" | "vawc_cases" | "lupon_cases" | "sessions"
  | "announcements" | "officials" | "hero_slides" | "health"
  | "population_events" | "chat" | "users";

type Listener = (topic: PulseTopic) => void;

const listeners = new Map<PulseTopic, Set<Listener>>();
let versions: Record<string, number> | null = null;
let timer: number | undefined;
let inFlight = false;

async function ask() {
  /* One request at a time. A slow answer must not stack up behind itself on
     a bad connection — that turns one request a second into a queue. */
  if (inFlight || document.hidden || listeners.size === 0) return;

  /*
   * Nobody is there. Stop asking — and let the token start ageing, which is
   * the whole mechanism behind the three-hour sign-out.
   *
   * The baseline is dropped so the next ask after they come back takes a
   * fresh reading rather than firing every page at once for changes that
   * happened while nobody was watching.
   */
  if (idleFor() > PAUSE_AFTER_IDLE_MS) {
    versions = null;

    return;
  }

  inFlight = true;

  try {
    const next = (await api.get("/pulse")).data.data as Record<string, number>;

    /*
     * The first answer sets the baseline and fires nothing.
     *
     * Every page has just fetched its own data on mount; calling them all
     * again because "the counter is not what it was (nothing)" would double
     * every page load.
     */
    if (versions === null) {
      versions = next;

      return;
    }

    const previous = versions;
    versions = next;

    for (const [topic, watchers] of listeners) {
      if (previous[topic] !== next[topic]) {
        watchers.forEach((fn) => fn(topic));
      }
    }
  } catch {
    /*
     * Silence is right here. The pulse is an accelerator, not the mechanism:
     * every page keeps its own slower timer, so a failed ask costs a second
     * of freshness and nothing else. A toast every second on a dropped
     * connection would be worse than the staleness.
     */
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer !== undefined) return;

  watchActivity();
  timer = window.setInterval(ask, INTERVAL_MS);
  /* Coming back to the tab is the moment somebody most wants the truth. */
  window.addEventListener("focus", ask);
  document.addEventListener("visibilitychange", ask);
}

function stop() {
  window.clearInterval(timer);
  timer = undefined;
  window.removeEventListener("focus", ask);
  document.removeEventListener("visibilitychange", ask);
  /* Dropped, so the next page to subscribe takes a fresh baseline rather
     than firing on a change that happened while nobody was watching. */
  versions = null;
}

/**
 * Run `onChange` when somebody else touches this kind of record.
 *
 * The callback is held in a ref, so a page can pass an inline closure without
 * resubscribing on every render — and the closure that runs is always the
 * latest one, with the current page number and filters in it.
 */
export function usePulse(topic: PulseTopic | null, onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!topic) return;

    const listener: Listener = () => callback.current();
    const set = listeners.get(topic) ?? new Set<Listener>();

    set.add(listener);
    listeners.set(topic, set);
    start();

    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(topic);
      if (listeners.size === 0) stop();
    };
  }, [topic]);
}
