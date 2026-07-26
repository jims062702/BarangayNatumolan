/**
 * Philippine mobile input: a fixed "+63" prefix plus exactly 10 digits.
 * Emits the combined value as "+63XXXXXXXXXX" (or "" when empty).
 */
interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function PhoneInput({ value, onChange, disabled }: PhoneInputProps) {
  // Derive the 10-digit local part from whatever format is stored.
  const digits = (value || "").replace(/\D/g, "");
  const local = (digits.startsWith("63") ? digits.slice(2) : digits).slice(0, 10);

  const handle = (raw: string) => {
    const ten = raw.replace(/\D/g, "").slice(0, 10);
    onChange(ten ? "+63" + ten : "");
  };

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
        className="w-full bg-transparent px-3 py-2.5 text-sm text-dark outline-none placeholder:text-gray-400"
      />
    </div>
  );
}
