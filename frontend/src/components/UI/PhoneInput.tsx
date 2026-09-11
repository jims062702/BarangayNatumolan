/**
 * Philippine mobile input: a fixed "+63" prefix plus exactly 10 digits.
 * Emits the combined value as "+63XXXXXXXXXX" (or "" when empty).
 */
import { localMobile, e164Mobile } from "../../lib/phone";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Insisted on by the browser before the form is sent.
   *
   * The pattern rides along with it: ten digits or nothing. Without one, a
   * half-typed 0917 satisfies `required` and fails at the server, which is a
   * round trip to say what the field could have said itself.
   */
  required?: boolean;
}

export default function PhoneInput({ value, onChange, disabled, required }: PhoneInputProps) {
  /*
   * The 10-digit local part, from whichever of the three shapes is stored.
   *
   * This used to strip a leading "63" and nothing else, so a number saved as
   * 09171234567 — eleven digits — had its last one cut off and came back as
   * 0917123456. It looked like a complete number and was not one.
   */
  const local = localMobile(value);

  const handle = (raw: string) => onChange(e164Mobile(raw));

  return (
    <div
      className={`flex items-center rounded-xl border border-gray bg-white transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="select-none border-r border-gray px-3 py-2.5 text-sm font-medium text-gray-500">
        +63
      </span>
      <input
        type="tel"
        inputMode="numeric"
        value={local}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        placeholder="9XX XXX XXXX"
        maxLength={10}
        required={required}
        pattern="[0-9]{10}"
        title="Ten digits, starting with 9 — for example 9171234567" 
        className="w-full bg-transparent px-3 py-2.5 text-sm text-dark outline-none placeholder:text-gray-400"
      />
    </div>
  );
}
