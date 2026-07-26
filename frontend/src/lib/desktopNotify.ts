import logo from "../assets/logo/logo.svg";

/**
 * Chrome / desktop notifications — the OS-level popups that appear even when
 * the browser tab is in the background or minimised. Complements the in-app
 * bell and the notification sound so users never miss an update.
 */

/** Whether the browser supports notifications at all. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission {
  if (!notificationsSupported()) return "denied";
  return Notification.permission;
}

/**
 * Ask for permission once. Must be called from a user gesture (click/keypress)
 * or the browser ignores it. Safe to call repeatedly — only prompts while the
 * permission is still "default".
 */
export async function ensureNotifyPermission(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // Very old browsers use a callback signature — ignore failures.
  }
}

/** Show a desktop popup (no-op unless the user granted permission). */
export function showDesktopNotification(title: string, body: string, tag?: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const options: NotificationOptions = { body, icon: logo };
    if (tag) options.tag = tag; // same tag replaces an older popup instead of stacking
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    // Some platforms keep popups until dismissed — auto-close after a while.
    setTimeout(() => notification.close(), 7000);
  } catch {
    // Constructing a Notification throws on some mobile browsers — ignore.
  }
}
