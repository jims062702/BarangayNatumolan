import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { FiBell, FiExternalLink, FiLogOut, FiMenu, FiSidebar, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
import { useAuth, homePathFor } from "../contexts/AuthContext";
import { useSignOut } from "../hooks/useSignOut";
import ErrorBoundary from "../components/ErrorBoundary";
import { PageBodySkeleton } from "../components/UI/Skeleton";
import ChatWidget from "../components/ChatWidget/ChatWidget";
import { menuFor } from "../lib/menu";
import { api } from "../lib/api";
import { useAutoRefresh, REFRESH } from "../hooks/useAutoRefresh";
import { useSoundMuted } from "../hooks/useSoundMuted";
import { playNotificationSound } from "../lib/sound";
import {
  ensureNotifyPermission,
  notificationPermission,
  notificationsSupported,
  showDesktopNotification,
} from "../lib/desktopNotify";
import type { AppNotification } from "../types";
import logo from "../assets/logo/logo.svg";

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [muted, toggleMuted] = useSoundMuted();
  const [perm, setPerm] = useState<NotificationPermission>(notificationPermission());
  // -1 = not loaded yet, so the first fetch never rings.
  const prevUnread = useRef(-1);

  const enableAlerts = async () => {
    await ensureNotifyPermission();
    setPerm(notificationPermission());
  };

  const load = async () => {
    try {
      const response = await api.get("/notifications");
      const nextUnread = response.data.data.unread_count as number;
      const list: AppNotification[] = response.data.data.notifications.data ?? [];
      // Alert only when the count goes up (a new notification arrived) —
      // never on the initial load or when marking things read.
      if (prevUnread.current >= 0 && nextUnread > prevUnread.current) {
        playNotificationSound();
        const newest = list.find((n) => !n.is_read) ?? list[0];
        if (newest) {
          // Desktop popup — shows even if the tab is in the background.
          showDesktopNotification(newest.subject, newest.message, `bn-notif-${newest.id}`);
        }
      }
      prevUnread.current = nextUnread;
      setUnread(nextUnread);
      setItems(list);
    } catch {
      // Non-critical; leave the bell empty.
    }
  };

  useEffect(() => {
    load();
    // Ask for desktop-notification permission on the first click/keypress
    // (browsers require a user gesture). Only prompts once, ever.
    const ask = () => ensureNotifyPermission();
    window.addEventListener("pointerdown", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
    return () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
  }, []);

  // Live updates: new notifications appear (and ring) without a refresh.
  // `evenWhenHidden` keeps polling while the user is on another tab so the
  // sound and desktop alert still fire.
  useAutoRefresh(load, REFRESH.staff, { evenWhenHidden: true });

  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    prevUnread.current = 0;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications (${unread} unread)`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <FiBell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        /*
         * On a phone the panel is anchored to the VIEWPORT, not to the bell.
         * A 320px panel hung off `right-0` from a bell that sits 208px in
         * reaches x = -112 — a third of every message was cut off past the
         * left edge with no way to scroll to it.
         */
        <div className="fixed inset-x-3 top-16 z-40 overflow-hidden rounded-2xl border border-gray bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between border-b border-gray px-4 py-3">
            <p className="text-sm font-semibold text-dark">Notifications</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMuted}
                aria-label={muted ? "Turn notification sound on" : "Turn notification sound off"}
                title={muted ? "Sound off — click to turn on" : "Sound on — click to mute"}
                className="cursor-pointer text-gray-400 transition-colors hover:text-primary"
              >
                {muted ? <FiVolumeX className="h-4 w-4" /> : <FiVolume2 className="h-4 w-4" />}
              </button>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="cursor-pointer text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Prompt to turn on Chrome desktop popups (once, per browser). */}
          {notificationsSupported() && perm === "default" && (
            <button
              type="button"
              onClick={enableAlerts}
              className="flex w-full items-center gap-2 border-b border-gray bg-primary/5 px-4 py-2.5 text-left text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <FiBell className="h-4 w-4 shrink-0" />
              Enable desktop alerts so you get notified on another tab
            </button>
          )}
          {notificationsSupported() && perm === "denied" && (
            <p className="border-b border-gray bg-warning/10 px-4 py-2.5 text-xs text-dark">
              Desktop alerts are blocked. To enable, click the lock/⚙ icon in
              your browser's address bar → Notifications → Allow.
            </p>
          )}

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                No notifications yet.
              </p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`border-b border-gray/60 px-4 py-3 ${n.is_read ? "" : "bg-primary/5"}`}
              >
                <p className="text-sm font-medium text-dark">{n.subject}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Remembers the collapsed rail across page loads and sessions. */
const COLLAPSE_KEY = "bn-sidebar-collapsed";

export default function DashboardLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  /*
   * Above the `if (!user) return null` below, and it has to stay there:
   * this calls hooks, and `user` is null on the first render of every
   * load. A hook that runs only on some renders changes the hook order
   * between them, which React refuses outright.
   */
  const signOut = useSignOut("/login");
  /*
   * How much is waiting behind each sidebar item, keyed by route. Refreshed
   * on the same beat as the notification bell: a number that is an hour old
   * is worse than none, because it is believed.
   */
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [badgeTick, setBadgeTick] = useState(0);
  useAutoRefresh(() => setBadgeTick((t) => t + 1), REFRESH.staff);

  useEffect(() => {
    void api
      .get("/dashboard/badges")
      .then((response) => setBadges(response.data.data ?? {}))
      // A desk that cannot reach the counts still has a working sidebar.
      .catch(() => undefined);
  }, [badgeTick]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "1"
  );

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  };

  if (!user) return null;

  const sections = menuFor(user);

  /**
   * Which ONE menu item the current page belongs to.
   *
   * Prefix matching alone lights up two items at once: /residents matches
   * while /residents/non-residents is open. Exact matching fixes that and
   * breaks something else — /residents/34, a resident's own page, then lights
   * up nothing at all, and the sidebar goes blank on every detail page.
   *
   * Neither rule is right on its own. The one that is: among the items whose
   * path the current URL sits under, the LONGEST wins. /residents/34 belongs
   * to Residents; /residents/non-residents belongs to Non-residents, because
   * it is the more specific of the two matches.
   */
  const activePath = sections
    .flatMap((section) => section.items.map((item) => item.to))
    .filter((to) => pathname === to || pathname.startsWith(to + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const handleLogout = () => void signOut();

  /**
   * `compact` is the icon-only rail. The mobile drawer always renders the full
   * sidebar — collapsing a drawer the user just opened makes no sense — so the
   * rail is a desktop-only state.
   */
  const renderSidebar = (compact: boolean) => (
    <div className="flex h-full flex-col bg-gradient-to-b from-primary-dark to-[#3d1f73] text-white">
      {/*
        Brand only — collapsed this is the logo and nothing else.
        The collapse control lives in the TOPBAR rather than here: sharing this
        row with a 36px button left only 140px for a name that needs 173px, and
        "Barangay Natum…" is not an acceptable way to show a barangay's own
        name. In the topbar it also keeps one fixed position in both states.
      */}
      <div
        className={`flex shrink-0 items-center py-5 ${compact ? "justify-center px-2" : "px-5"}`}
      >
        <Link to={homePathFor(user)} className="flex min-w-0 items-center gap-3">
          <img src={logo} alt="Barangay Natumolan logo" className="h-10 w-10 shrink-0" />
          {!compact && (
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-bold">Barangay Natumolan</span>
              <span className="block text-[11px] text-white/70">
                {user.role === "Resident" ? "Resident Portal" : "Management System"}
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Sidebar"
        className={`flex-1 space-y-5 overflow-y-auto pb-6 ${compact ? "px-2" : "px-3"}`}
      >
        {sections.map((section, index) => (
          <div key={index}>
            {section.heading &&
              (compact ? (
                // No room for a heading in the rail — a rule keeps the grouping.
                <div aria-hidden="true" className="mx-2 mb-2 mt-3 border-t border-white/15" />
              ) : (
                <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                  {section.heading}
                </p>
              ))}
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    // The only label left in the rail, so it has to be here.
                    title={compact ? item.label : undefined}
                    aria-label={
                      badges[item.to] > 0
                        ? `${item.label} — ${badges[item.to]} waiting`
                        : undefined
                    }
                    // Not NavLink's own isActive: it cannot express
                    // "longest match wins", which is the only rule that
                    // lights one item on both /residents/34 and
                    // /residents/non-residents.
                    aria-current={item.to === activePath ? "page" : undefined}
                    className={`relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors ${
                      compact ? "justify-center px-2" : "gap-3 px-3"
                    } ${
                      item.to === activePath
                        ? "bg-white text-primary shadow-sm"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                    {!compact && <span className="flex-1 truncate">{item.label}</span>}
                    {/*
                      What is waiting behind this page. Shown only when there
                      is something — a row of zeros is a row of noise, and a
                      clerk learns to stop reading it within a day.

                      In the collapsed rail there is no room for a number, so
                      it becomes a dot: still says "look here", takes no space.
                    */}
                    {badges[item.to] > 0 &&
                      (compact ? (
                        <span
                          aria-hidden="true"
                          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger"
                        />
                      ) : (
                        <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                          {badges[item.to] > 99 ? "99+" : badges[item.to]}
                        </span>
                      ))}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/*
        The public site, from anywhere.
        
        It lived on the SK dashboard alone, which is the one office that
        edits the landing page — but every desk has reason to look at what a
        resident actually sees, and hunting for the one page that links to it
        is not a way to find out.

        In the sidebar rather than duplicated into seven dashboard headers:
        the same link on every page for every role, and one place to change.
      */}
      <div className={`shrink-0 border-t border-white/15 ${compact ? "px-2 py-3" : "px-3 py-3"}`}>
        <a
          href="/"
          target="_blank"
          /* noreferrer, not just noopener: the staff URL a clerk came from is
             nobody's business on the public side. */
          rel="noreferrer"
          title={compact ? "View public site" : undefined}
          aria-label="View public site (opens in a new tab)"
          className={`flex items-center rounded-xl py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white ${
            compact ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <FiExternalLink className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          {!compact && <span className="flex-1 truncate">View public site</span>}
        </a>
      </div>

      {!compact && (
        <div className="border-t border-white/15 px-5 py-4 text-[11px] text-white/60">
          Tagoloan, Misamis Oriental
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary">
      {/* Desktop sidebar — full width, or the icon-only rail when collapsed */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 ease-out lg:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {renderSidebar(collapsed)}
      </aside>

      {/* Mobile drawer — always the full sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-dark/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72">{renderSidebar(false)}</aside>
        </div>
      )}

      <div
        className={`transition-[padding] duration-200 ease-out ${
          collapsed ? "lg:pl-[72px]" : "lg:pl-64"
        }`}
      >
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              onClick={() => setSidebarOpen((o) => !o)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-dark hover:bg-primary/10 lg:hidden"
            >
              {sidebarOpen ? <FiX className="h-5 w-5" /> : <FiMenu className="h-5 w-5" />}
            </button>

            {/* Collapse/expand the sidebar — desktop only, and in the same spot
                the mobile drawer button occupies at narrower widths. */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-primary/10 hover:text-primary lg:flex"
            >
              <FiSidebar className="h-5 w-5" />
            </button>
            <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:inline-block">
              {user.role === "Resident" ? "Resident" : user.office}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <NotificationsBell />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-dark">{user.name}</p>
              <p className="text-xs text-gray-500">{user.role}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {user.name.charAt(0)}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              title="Logout"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <FiLogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {/* Scoped so a failing page keeps the sidebar and topbar usable
              instead of blanking the whole screen. */}
          <ErrorBoundary label="This page could not be displayed">
            {/*
              The page's own boundary, inside the shell.

              Without it a move between two pages fell all the way out to the
              router's fallback, which redraws the whole app shell — so the
              sidebar and topbar already on screen flickered away and came
              back to sit in exactly the same place. Only the body waits now.
            */}
            <Suspense fallback={<PageBodySkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/*
        The assistant, for residents only.

        It lived on the public site alone, so a resident signed in to do the
        thing they came for — check a request, read an announcement — had to
        leave the portal and go back to the landing page to ask a question
        about it. Staff have the desk itself and do not need the widget.
      */}
      {user.role === "Resident" && <ChatWidget />}
    </div>
  );
}
