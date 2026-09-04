import { useEffect } from "react";

/**
 * Replaces the browser's ugly native validation bubble ("Please fill out this
 * field") with a modern inline red message + red outline on the offending
 * field — for EVERY form in the app, with zero per-form wiring.
 *
 * How: the native `invalid` event fires on each constrained control when a
 * form is submitted with bad input. We listen for it in the capture phase
 * (it doesn't bubble), call preventDefault() to suppress the native bubble,
 * and render our own message beneath the field. The browser still blocks the
 * submit until the field is valid, so validation behaviour is unchanged — only
 * its appearance is. Errors clear as soon as the field becomes valid again.
 *
 * Mounted once, near the top of the tree.
 */

const INVALID_CLASS = "bn-invalid";
const ERROR_CLASS = "bn-field-error";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isField(el: EventTarget | null): el is Field {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

/** Friendly, human message for whichever constraint failed. */
function messageFor(el: Field): string {
  const v = el.validity;
  if (v.valueMissing) {
    if (el instanceof HTMLSelectElement) return "Please choose an option.";
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      return "Please tick this to continue.";
    }
    return "This field is required.";
  }
  if (v.typeMismatch) {
    if (el instanceof HTMLInputElement && el.type === "email") return "Enter a valid email address.";
    if (el instanceof HTMLInputElement && el.type === "url") return "Enter a valid link (URL).";
    return "Please enter a valid value.";
  }
  if (v.patternMismatch) return el.title || "Please match the requested format.";
  if (v.tooShort && el instanceof HTMLInputElement) return `Please use at least ${el.minLength} characters.`;
  if (v.tooLong && el instanceof HTMLInputElement) return `Please use ${el.maxLength} characters or fewer.`;
  if (v.rangeUnderflow && el instanceof HTMLInputElement) return `Please enter ${el.min} or more.`;
  if (v.rangeOverflow && el instanceof HTMLInputElement) return `Please enter ${el.max} or less.`;
  if (v.stepMismatch || v.badInput) return "Please enter a valid value.";
  return el.validationMessage || "Please check this field.";
}

const WARN_SVG =
  '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 112 0v4a1 1 0 11-2 0V9zm1-4.75A1.25 1.25 0 1010 6.75 1.25 1.25 0 0010 4.25z" clip-rule="evenodd"/></svg>';

function showError(el: Field) {
  el.classList.add(INVALID_CLASS);
  el.setAttribute("aria-invalid", "true");

  let msg = el.nextElementSibling;
  if (!(msg instanceof HTMLElement) || !msg.classList.contains(ERROR_CLASS)) {
    msg = document.createElement("p");
    msg.className = ERROR_CLASS;
    el.insertAdjacentElement("afterend", msg);
  }
  // SVG icon + text; text set via textContent so field titles can't inject HTML.
  msg.innerHTML = `${WARN_SVG}<span></span>`;
  const span = msg.querySelector("span");
  if (span) span.textContent = messageFor(el);
}

function clearError(el: Field) {
  el.classList.remove(INVALID_CLASS);
  el.removeAttribute("aria-invalid");
  const msg = el.nextElementSibling;
  if (msg instanceof HTMLElement && msg.classList.contains(ERROR_CLASS)) {
    msg.remove();
  }
}

export default function FormValidationStyler() {
  useEffect(() => {
    // Focus only the first invalid field per submit burst (all `invalid`
    // events fire synchronously; the microtask resets the flag afterwards).
    let focusTaken = false;

    const onInvalid = (e: Event) => {
      if (!isField(e.target)) return;
      e.preventDefault(); // suppress the native bubble
      const el = e.target;
      showError(el);
      if (!focusTaken) {
        focusTaken = true;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        queueMicrotask(() => {
          focusTaken = false;
        });
      }
    };

    /*
     * Re-check the field that changed — and every other field still showing
     * an error.
     *
     * The sweep is the important half. React sets a controlled input's value
     * as a DOM property, which fires NO input event, so a field filled in by
     * another field's onChange kept its red outline and its "This field is
     * required" while plainly holding text. Anything the user types anywhere
     * is a good moment to ask whether the marked fields are still wrong.
     *
     * Cheap: it only ever looks at fields currently carrying the class, and
     * there are never many.
     */
    const onLiveCheck = (e: Event) => {
      if (isField(e.target)) {
        const el = e.target;
        if (el.classList.contains(INVALID_CLASS) && el.validity.valid) clearError(el);
      }

      document.querySelectorAll<Field>('.' + INVALID_CLASS).forEach((el) => {
        if (el.validity.valid) clearError(el);
      });
    };

    // `invalid` does not bubble → listen in the capture phase.
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onLiveCheck, true);
    document.addEventListener("change", onLiveCheck, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onLiveCheck, true);
      document.removeEventListener("change", onLiveCheck, true);
    };
  }, []);

  return null;
}
