import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FiEye, FiEyeOff, FiHeart } from "react-icons/fi";
import { api, errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { confirmAction } from "../lib/confirm";
import Card from "./UI/Card";
import Modal from "./UI/Modal";
import FormField, { inputClasses } from "./UI/FormField";
import type { Resident } from "../types";

/**
 * A resident's marriages, current and past.
 *
 * A marriage ending is not the erasure of a fact — it is a fact of its own. A
 * widow re-marries, a separated couple each start again, and the barangay
 * still has to be able to explain why a certificate from four years ago names
 * a different spouse. So ending one records WHY, and keeps it.
 *
 * Whether the children see the reason is the family's call, not the office's,
 * which is what the visibility toggle is for.
 */

export interface Marriage {
  id: number;
  /** "Married" or "Live-in" — only the first one changes a civil status. */
  union_type?: string;
  partner?: { id: number; first_name: string; last_name: string } | null;
  partner_name?: string | null;
  married_on?: string | null;
  ended_on?: string | null;
  end_reason?: string | null;
  end_notes?: string | null;
  deceased_name?: string | null;
  shown_to_children: boolean;
  is_current: boolean;
}

const REASONS = ["Separated", "Annulled", "Divorced", "Widowed", "Other"] as const;

/** What each ending does to the civil status on the record. */
const REASON_EFFECT: Record<string, string> = {
  Separated: "Both are marked Separated.",
  Annulled: "Both go back to Single.",
  Divorced: "Both go back to Single.",
  Widowed: "The surviving partner is marked Widowed.",
  Other: "Civil status is left as it is.",
};

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "medium" }) : null;

interface Props {
  resident: Resident;
  /** Reload the profile — ending a marriage frees the spouse slot. */
  onChanged: () => void;
}

export default function MarriageHistory({ resident, onChanged }: Props) {
  const [marriages, setMarriages] = useState<Marriage[]>([]);
  const [ending, setEnding] = useState<Marriage | null>(null);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [endedOn, setEndedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [deceased, setDeceased] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/residents/${resident.id}/marriages`)
      .then((r) => setMarriages(r.data.data ?? []))
      .catch(() => setMarriages([]));
  }, [resident.id]);

  useEffect(() => {
    setMarriages([]);
    load();
  }, [load]);

  if (marriages.length === 0) return null;

  const openEnd = (marriage: Marriage) => {
    setEnding(marriage);
    setReason(REASONS[0]);
    setEndedOn("");
    setNotes("");
    setDeceased("");
    setConsent(false);
  };

  const submitEnd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ending) return;

    if (
      !(await confirmAction({
        title: `End the marriage to ${ending.partner_name ?? "this spouse"}?`,
        text: "It stays on record with the reason. Both are then free to be recorded as married again.",
        confirmText: "Yes, record it",
      }))
    )
      return;

    setSaving(true);
    try {
      const response = await api.post(`/residents/${resident.id}/marriages/${ending.id}/end`, {
        end_reason: reason,
        ended_on: endedOn || undefined,
        end_notes: notes || undefined,
        deceased_id: reason === "Widowed" && deceased ? Number(deceased) : undefined,
        shown_to_children: consent,
      });
      toast(response.data.message);
      setEnding(null);
      load();
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (marriage: Marriage) => {
    const turningOn = !marriage.shown_to_children;

    if (
      turningOn &&
      !(await confirmAction({
        title: "Show this to the children?",
        text: "Only with the family's agreement. It will appear on their own family page.",
        confirmText: "Yes, they agreed",
      }))
    )
      return;

    try {
      const response = await api.post(
        `/residents/${resident.id}/marriages/${marriage.id}/visibility`,
        { shown_to_children: turningOn }
      );
      toast(response.data.message);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  // Only the two partners can be the one who died — by real id, so the
  // server can tell which of them survives.
  const partnerOptions = ending
    ? [
        { id: resident.id, name: `${resident.first_name} ${resident.last_name}` },
        ...(ending.partner ? [{ id: ending.partner.id, name: ending.partner_name ?? "" }] : []),
      ]
    : [];

  return (
    <>
      <Card title="Marriages & partnerships">
        <div className="space-y-2">
          {marriages.map((marriage) => (
            <div
              key={marriage.id}
              className={`rounded-xl border px-4 py-3 ${
                marriage.is_current ? "border-primary/40 bg-primary/5" : "border-gray"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-dark">
                    <FiHeart
                      aria-hidden="true"
                      className={`h-4 w-4 ${marriage.is_current ? "text-primary" : "text-gray-400"}`}
                    />
                    {marriage.partner_name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {marriage.is_current ? (
                      <>
                        {marriage.union_type === "Live-in" ? "Living together" : "Currently married"}
                        {asDate(marriage.married_on) && ` · since ${asDate(marriage.married_on)}`}
                      </>
                    ) : (
                      <>
                        {marriage.end_reason}
                        {asDate(marriage.ended_on) && ` · ${asDate(marriage.ended_on)}`}
                        {marriage.deceased_name && ` · ${marriage.deceased_name} passed away`}
                      </>
                    )}
                  </p>
                  {marriage.end_notes && (
                    <p className="mt-1 text-xs italic text-gray-500">{marriage.end_notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {marriage.is_current ? (
                    <button
                      type="button"
                      onClick={() => openEnd(marriage)}
                      className="cursor-pointer rounded-full border border-gray px-3.5 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-danger hover:text-danger"
                    >
                      {marriage.union_type === "Live-in" ? "End this partnership" : "End this marriage"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(marriage)}
                      title={
                        marriage.shown_to_children
                          ? "The children can see how this ended"
                          : "Hidden from the children until the family agrees"
                      }
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        marriage.shown_to_children
                          ? "border-primary/40 text-primary hover:bg-primary hover:text-white"
                          : "border-gray text-gray-500 hover:border-primary hover:text-primary"
                      }`}
                    >
                      {marriage.shown_to_children ? (
                        <>
                          <FiEye aria-hidden="true" className="h-3.5 w-3.5" /> Children can see
                        </>
                      ) : (
                        <>
                          <FiEyeOff aria-hidden="true" className="h-3.5 w-3.5" /> Hidden from children
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-gray-400">
          A union that ends is kept, not erased — it is what explains an older certificate naming a
          different spouse. A <strong>live-in partnership</strong> is recorded the same way but never
          touches anyone&rsquo;s civil status. The reason is always on record here; whether the{" "}
          <strong>children</strong> see it is the family&rsquo;s decision.
        </p>
      </Card>

      <Modal
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={`End the marriage to ${ending?.partner_name ?? ""}`}
      >
        <form onSubmit={submitEnd} className="space-y-4">
          <FormField label="Reason" required hint={REASON_EFFECT[reason]}>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClasses}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </FormField>

          {reason === "Widowed" && (
            <FormField label="Who passed away?" required hint="The other partner is the one marked widowed.">
              <select
                value={deceased}
                onChange={(e) => setDeceased(e.target.value)}
                required
                className={inputClasses}
              >
                <option value="">Select…</option>
                {partnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {deceased && (
                <span className="mt-1 block text-xs text-warning">
                  Recording the death itself is a Population Event — this only ends the marriage.
                </span>
              )}
            </FormField>
          )}

          <FormField label="Date it ended" hint="Leave blank for today.">
            <input
              type="date"
              value={endedOn}
              onChange={(e) => setEndedOn(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={inputClasses}
            />
          </FormField>

          <FormField label="Notes" hint="Optional — anything the office should know.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClasses}
            />
          </FormField>

          <div className="rounded-xl border border-gray p-4">
            <button
              type="button"
              onClick={() => setConsent((v) => !v)}
              aria-pressed={consent}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                consent
                  ? "border-primary bg-primary text-white"
                  : "border-gray bg-white text-dark hover:border-primary hover:text-primary"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                  consent ? "border-white bg-white/20" : "border-gray"
                }`}
              >
                {consent ? "✓" : ""}
              </span>
              The family agreed the children may see this
            </button>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              The reason is recorded either way — the office needs it. This only decides whether it
              appears on the children&rsquo;s own family page. You can change it later.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || (reason === "Widowed" && !deceased)}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Record how this marriage ended"}
          </button>
        </form>
      </Modal>
    </>
  );
}
