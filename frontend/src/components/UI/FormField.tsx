import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

/** Consistent styling for inputs/selects/textareas inside forms. */
export const inputClasses =
  "w-full rounded-xl border border-gray bg-white px-3.5 py-2.5 text-sm text-dark placeholder:text-gray-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-secondary disabled:text-gray-400";

export default function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-dark">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
