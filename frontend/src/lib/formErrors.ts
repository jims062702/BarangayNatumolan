/**
 * Surfaces server-side (422) field errors inline, reusing the global
 * <FormValidationStyler>. It sets each control's custom validity and asks the
 * browser to report it — the styler intercepts the resulting `invalid` event
 * and renders our red message under the field, just like a client-side error.
 *
 * Controls are matched by `name`, with a fallback to `input[type=email]` for
 * the common duplicate-email case (our form inputs are controlled and often
 * have no name attribute). Returns true if at least one error was shown.
 */
export function showServerFieldErrors(
  form: HTMLFormElement | null,
  errors: Record<string, string>
): boolean {
  if (!form) return false;

  const applied: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] = [];
  for (const [name, message] of Object.entries(errors)) {
    const el =
      form.querySelector<HTMLInputElement>(`[name="${name}"]`) ??
      (name === "email" ? form.querySelector<HTMLInputElement>('input[type="email"]') : null);
    if (el) {
      el.setCustomValidity(message);
      applied.push(el);
    }
  }
  if (applied.length === 0) return false;

  form.reportValidity(); // fires `invalid` → styler shows the message inline
  // Reset so a later edit/submit isn't permanently stuck invalid; the rendered
  // message + red outline stay until the user edits the field.
  applied.forEach((el) => el.setCustomValidity(""));
  return true;
}
