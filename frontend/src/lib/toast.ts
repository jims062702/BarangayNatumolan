import Swal from "sweetalert2";

export type ToastKind = "success" | "error" | "info" | "warning";

/** Long enough to read a sentence, short enough not to sit in the way. */
const DURATION_MS = 4000;

/** How far a toast must be dragged before letting go dismisses it. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * How far the pointer must move before the toast takes it over.
 *
 * Below this nothing is captured at all, so a hover or a click leaves the
 * rest of the page behaving normally.
 */
const DRAG_START_PX = 6;

/** How far it slides on the way out, past the edge of anything it sat over. */
const SWIPE_EXIT_PX = 420;

/**
 * Lets a toast be thrown off the side of the screen.
 *
 * Hovering pauses the timer so a long message can be finished — which is
 * right until the reader has finished it, at which point the toast sits
 * there for as long as the pointer happens to be near it. The pause has no
 * escape of its own: the faster you want to move on, the longer it stays.
 *
 * So the toast can be pushed away in either direction. Either direction,
 * because the toast sits in the top-right corner and a right-handed flick
 * and a left-handed one are both somebody saying "gone".
 */
function makeSwipeable(el: HTMLElement): void {
  let startX = 0;
  let dragging = false;
  let captured = false;
  let activePointer: number | null = null;

  // Horizontal drags belong to the toast; vertical ones still scroll the page.
  el.style.touchAction = "pan-y";
  el.style.cursor = "grab";

  const glide = "transform 160ms ease, opacity 160ms ease";

  el.addEventListener("pointerdown", (event) => {
    // The close button is its own gesture.
    if ((event.target as HTMLElement).closest(".swal2-close")) return;

    dragging = true;
    activePointer = event.pointerId;
    startX = event.clientX;
    el.style.transition = "none";
  });

  el.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointer) return;

    const dx = event.clientX - startX;

    /*
     * Nothing is captured until the pointer has actually moved.
     *
     * Capturing on the press sent every later pointer event on the page to
     * this toast, so hovering anything else stopped registering and the
     * cursor kept whatever shape the toast had given it — until the toast
     * expired and took the capture with it. A press that turns out to be a
     * click, or a hover that never presses at all, should leave no trace.
     */
    if (!captured && Math.abs(dx) < DRAG_START_PX) return;

    if (!captured) {
      captured = true;
      el.style.cursor = "grabbing";
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // The toast can close mid-gesture; the drag ends with it.
      }
    }

    el.style.transform = `translateX(${dx}px)`;
    // Fading as it goes says it is leaving, not just moving.
    el.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 260));
  });

  const release = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== activePointer) return;

    dragging = false;
    el.style.cursor = "grab";

    /*
     * Handed back explicitly, and only if it was ever taken. A capture that
     * outlives its gesture is the whole page's pointer events going to a
     * toast that is about to vanish.
     */
    if (captured) {
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // Already released, which is the outcome we wanted anyway.
      }
    }

    captured = false;
    activePointer = null;

    const dx = event.clientX - startX;

    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) {
      // Not far enough to mean it — and a plain click never dismisses.
      el.style.transition = glide;
      el.style.transform = "";
      el.style.opacity = "";
      return;
    }

    el.style.transition = glide;
    el.style.transform = `translateX(${dx > 0 ? SWIPE_EXIT_PX : -SWIPE_EXIT_PX}px)`;
    el.style.opacity = "0";

    window.setTimeout(() => {
      /*
       * Only if this is still the toast on screen. A second toast can open
       * while this one is sliding out, and closing that one would take away
       * a message the reader has not seen.
       */
      if (Swal.getPopup() === el) Swal.close();
    }, 160);
  };

  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

/**
 * A toast in the top-right corner that dismisses itself.
 *
 * Replaces the inline feedback banner that used to appear above the page
 * content: that banner pushed the layout down, was easy to miss when the reader
 * was looking at the row they had just acted on, and stayed on screen until the
 * next action replaced it.
 *
 * Hovering pauses the timer, so a long message can still be finished. Two ways
 * out of that pause: the close button, and a swipe in either direction.
 */
export function toast(message: string, kind: ToastKind = "success"): void {
  if (!message) return;

  Swal.fire({
    toast: true,
    position: "top-end",
    icon: kind,
    title: message,
    showConfirmButton: false,
    // The one that needs no aim, for a reader who is already using a mouse.
    showCloseButton: true,
    timer: DURATION_MS,
    timerProgressBar: true,
    /*
     * No focusConfirm: a toast has no confirm button to focus, and
     * SweetAlert2 warns about it on every single toast. Nothing here takes
     * focus anyway — the reader is usually mid-task in a form or a row.
     */
    didOpen: (el) => {
      el.addEventListener("mouseenter", Swal.stopTimer);
      el.addEventListener("mouseleave", Swal.resumeTimer);
      makeSwipeable(el);
    },
    customClass: {
      title: "!text-sm !font-medium !text-left",
      closeButton: "!text-gray-400 hover:!text-gray-600 !text-2xl !shadow-none",
    },
  });
}

/** Convenience for the `catch` branches, which all report a failure. */
export function toastError(message: string): void {
  toast(message, "error");
}
