import { useState, type FormEvent } from "react";
import { FiAlertCircle, FiHeart } from "react-icons/fi";
import { api, errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { confirmAction } from "../lib/confirm";
import Card from "./UI/Card";
import Modal from "./UI/Modal";
import FormField, { inputClasses } from "./UI/FormField";
import type { Resident } from "../types";

/**
 * Living or deceased — the Population Office's record of it.
 *
 * Kept apart from "deactivate this record", because they are different facts
 * with different consequences. Marking someone deceased takes them out of the
 * population figures, switches off their portal login and ends their marriage
 * as widowed — but their FAMILY LINKS stay, because they are still somebody's
 * father, and a grandchild should not lose their lolo.
 */

interface Props {
  resident: Resident;
  onChanged: () => void;
}

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "long" }) : null;

export default function LifeStatusEditor({ resident, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const deceased = resident.life_status === "Deceased";

  const recordDeath = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: `Record ${resident.first_name} ${resident.last_name} as deceased?`,
        text: "They leave the population count and their portal login is switched off. Their family links are kept.",
        confirmText: "Yes, record it",
      }))
    )
      return;

    setSaving(true);
    try {
      const response = await api.post(`/residents/${resident.id}/life-status`, {
        life_status: "Deceased",
        date_of_death: dateOfDeath || undefined,
        note: note || undefined,
      });
      toast(response.data.message);
      setOpen(false);
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const markAlive = async () => {
    if (
      !(await confirmAction({
        title: "Correct this back to living?",
        text: "Use this only if the death was recorded in error. Their marriage and portal login are NOT restored automatically — check those afterwards.",
        confirmText: "Yes, this was a mistake",
        danger: true,
      }))
    )
      return;

    try {
      const response = await api.post(`/residents/${resident.id}/life-status`, {
        life_status: "Alive",
      });
      toast(response.data.message);
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <Card title="Living status">
        {deceased ? (
          <>
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-gray/60 px-4 py-3 text-sm leading-relaxed text-dark">
              <FiAlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
              <span>
                Recorded as <strong>deceased</strong>
                {asDate(resident.date_of_death) && <> on {asDate(resident.date_of_death)}</>}.
                {resident.life_status_note && <> {resident.life_status_note}</>}
                <br />
                They are out of the population count and cannot sign in. Their family links are
                kept — they are still recorded as a parent, and their grandchildren still have
                them as a lolo or lola.
              </span>
            </p>
            <button
              type="button"
              onClick={markAlive}
              className="cursor-pointer rounded-full border border-gray px-5 py-2 text-sm font-semibold text-dark transition-colors hover:border-danger hover:text-danger"
            >
              Recorded in error — mark as living
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm leading-relaxed text-dark">
              <FiHeart aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <span>
                Recorded as <strong>living</strong> and counted in the barangay population.
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setDateOfDeath("");
                setNote("");
                setOpen(true);
              }}
              className="cursor-pointer rounded-full border border-gray px-5 py-2 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
            >
              Record as deceased
            </button>
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Record ${resident.first_name} ${resident.last_name} as deceased`}
      >
        <p className="mb-4 rounded-xl bg-warning/10 px-4 py-3 text-xs leading-relaxed text-dark">
          <strong>What this does:</strong> removes them from the population count, switches off
          their portal login, ends their marriage as <strong>widowed</strong> (so the surviving
          spouse may be recorded as married again), and files a <strong>Death</strong> entry on the
          population register for verification.
          <br />
          <br />
          <strong>What it keeps:</strong> every family link. They remain on their children&rsquo;s
          records as a parent, and on their grandchildren&rsquo;s as a lolo or lola.
        </p>

        <form onSubmit={recordDeath} className="space-y-4">
          <FormField label="Date of death" hint="Leave blank for today.">
            <input
              type="date"
              value={dateOfDeath}
              onChange={(e) => setDateOfDeath(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              min={resident.birthdate ? resident.birthdate.slice(0, 10) : undefined}
              className={inputClasses}
            />
          </FormField>

          <FormField label="Note" hint="Optional — who reported it, or the reference document.">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Reported by the family; PSA death certificate on file"
            />
          </FormField>

          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record as deceased"}
          </button>
        </form>
      </Modal>
    </>
  );
}
