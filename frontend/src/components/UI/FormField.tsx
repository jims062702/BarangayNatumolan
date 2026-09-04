import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  /**
   * Render as a plain <div> instead of a <label>.
   *
   * Required whenever the field contains a BUTTON — a resident picker, a
   * household picker, removable chips. The browser forwards a click anywhere
   * inside a <label> to the first labelable control it contains, and <button>
   * is labelable — so clicking empty space beside the field silently presses
   * "Change", or the "×" on a chip, without the pointer ever being near it.
   */
  plain?: boolean;
}

/** Consistent styling for inputs/selects/textareas inside forms. */
export const inputClasses =
  "w-full rounded-xl border border-gray bg-white px-3.5 py-2.5 text-sm text-dark placeholder:text-gray-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-secondary disabled:text-gray-400";

export default function FormField({
  label,
  required,
  hint,
  children,
  plain = false,
}: FormFieldProps) {
  const Wrapper = plain ? "div" : "label";

  return (
    <Wrapper className="block">
      <span className="mb-1.5 block text-sm font-medium text-dark">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </Wrapper>
  );
}
