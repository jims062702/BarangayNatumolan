import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import Modal from "./UI/Modal";
import FormField, { inputClasses } from "./UI/FormField";
import { memberName } from "./FamilyPanel";
import type { FamilyMember } from "../types";

/**
 * Ends a guardianship — the parents came home, the child turned 18.
 *
 * Deliberately not the same button as "Unlink". Unlinking is the undo for a
 * carer recorded against the wrong child; ending is a fact about this child's
 * life, and the row stays on the record because "who was raising this child
 * in 2026?" is asked long after the arrangement is over.
 */

/** Must match Guardianship::END_REASONS on the server. */
const END_REASONS = [
  "Parents came home",
  "Child moved to the parents",
  "Child is now of age",
  "Guardian passed away",
  "Child moved out of the barangay",
  "Recorded in error",
  "Other",
];

interface Props {
  /** The guardian being ended, or null when the dialog is closed. */
  guardian: FamilyMember | null;
  /** Whose record this is — used in the wording and the URL. */
  residentId: number | string;
  wardName: string;
  onClose: () => void;
  onEnded: (message: string) => void;
}

export default function EndGuardianshipModal({
  guardian,
  residentId,
  wardName,
  onClose,
  onEnded,
}: Props) {
  const [reason, setReason] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!guardian) return;
    setReason("");
    setEndedOn("");
    setNote("");
    setError("");
  }, [guardian]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const guardianshipId = guardian?.guardianship?.id;
    if (!guardianshipId) return;

    setSaving(true);
    setError("");
    try {
      const response = await api.post(
        `/residents/${residentId}/guardianships/${guardianshipId}/end`,
        {
          end_reason: reason,
          ended_on: endedOn || undefined,
          note: note || undefined,
        }
      );
      onEnded(response.data.message);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={guardian !== null}
      onClose={onClose}
      title={guardian ? `End ${memberName(guardian)}'s guardianship` : "End guardianship"}
    >
      {error && (
        <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-xl bg-secondary/70 px-4 py-3 text-xs leading-relaxed text-gray-600">
          The arrangement stays on {wardName}&rsquo;s record with the reason it ended, and
          {" "}
          {guardian ? memberName(guardian) : "the guardian"} stops being the person the barangay
          contacts. Nothing about either resident record changes.
        </p>

        <FormField label="Why did it end?" required>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className={inputClasses}
          >
            <option value="">Select…</option>
            {END_REASONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </FormField>

        <FormField label="When?" hint="Leave blank for today.">
          <input
            type="date"
            value={endedOn}
            onChange={(e) => setEndedOn(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className={inputClasses}
          />
        </FormField>

        <FormField label="Note" hint="Optional — anything the next clerk should know.">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClasses} />
        </FormField>

        <button
          type="submit"
          disabled={saving || !reason}
          className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "End the guardianship"}
        </button>
      </form>
    </Modal>
  );
}
