import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { FiBell, FiLogOut, FiMenu, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
import { useAuth, homePathFor } from "../contexts/AuthContext";
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
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-gray bg-white shadow-xl">
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

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const sections = menuFor(user);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-primary-dark to-[#3d1f73] text-white">
      <Link to={homePathFor(user)} className="flex items-center gap-3 px-5 py-5">
        <img src={logo} alt="Barangay Natumolan logo" className="h-10 w-10" />
        <span className="leading-tight">
          <span className="block text-sm font-bold">Barangay Natumolan</span>
          <span className="block text-[11px] text-white/70">
            {user.role === "Resident" ? "Resident Portal" : "Management System"}
          </span>
        </span>
      </Link>

      <nav aria-label="Sidebar" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {sections.map((section, index) => (
          <div key={index}>
            {section.heading && (
              <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                {section.heading}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/portal" || item.to === "/dashboard"}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-white text-primary shadow-sm"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/15 px-5 py-4 text-[11px] text-white/60">
        Tagoloan, Misamis Oriental
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-dark/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
