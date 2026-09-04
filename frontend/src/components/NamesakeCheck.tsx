import type { ReactNode } from "react";
import axios from "axios";
import Modal from "./UI/Modal";

/**
 * "This name is already registered" — the confirmation step in front of every
 * form that creates a resident.
 *
 * Namesakes are ordinary in a barangay, so the server refuses the first
 * attempt and hands back who already holds the name; the clerk compares
 * birthdate and purok and decides. It lives in its own component because the
 * Add parent / Add child / Add spouse forms need exactly the same protection —
 * those are where a duplicate is MOST likely, since the relative is often
 * already on the register under a slightly different record.
 */

/** An already-registered resident who shares the name being entered. */
export interface Namesake {
  id: number;
  resident_number: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birthdate?: string | null;
  zone_purok?: string | null;
  is_active: boolean;
}

/** Pulls the namesake list out of the server's 409, if that's what this is. */
export function namesakesFrom(err: unknown): Namesake[] | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return null;
  const list = (err.response.data as { errors?: { namesakes?: Namesake[] } })?.errors?.namesakes;
  return list?.length ? list : null;
}

interface Props {
  /** Null closes the dialog; a non-empty list opens it. */
  namesakes: Namesake[] | null;
  firstName: string;
  lastName: string;
  birthdate: string;
  zonePurok: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** How to link to an existing record — a route here, a picker there. */
  renderLink?: (namesake: Namesake) => ReactNode;
}

export default function NamesakeCheck({
  namesakes,
  firstName,
  lastName,
  birthdate,
  zonePurok,
  saving = false,
  onCancel,
  onConfirm,
  renderLink,
}: Props) {
  return (
    <Modal
      open={namesakes !== null}
      onClose={onCancel}
      wide
      title="This name is already registered"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          {namesakes?.length === 1 ? "A resident" : `${namesakes?.length} residents`} named{" "}
          <strong className="text-dark">
            {firstName} {lastName}
          </strong>{" "}
          {namesakes?.length === 1 ? "is" : "are"} already in the registry.
          Compare the details below before continuing — registering the same
          person twice splits their records.
        </p>

        <div className="overflow-x-auto rounded-xl border border-gray">
          <table className="min-w-full divide-y divide-gray text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                {["Resident No.", "Full name", "Birthdate", "Purok", ""].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray/70">
              {namesakes?.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2.5 font-mono text-xs">{n.resident_number}</td>
                  <td className="px-4 py-2.5">
                    {[n.first_name, n.middle_name, n.last_name, n.suffix]
                      .filter(Boolean)
                      .join(" ")}
                    {!n.is_active && (
                      <span className="ml-2 rounded-full bg-gray px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {n.birthdate ? new Date(n.birthdate).toLocaleDateString("en-PH") : "—"}
                  </td>
                  <td className="px-4 py-2.5">{n.zone_purok ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{renderLink?.(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-secondary px-4 py-3 text-xs text-gray-500">
          You are registering a person born{" "}
          <strong className="text-dark">
            {birthdate ? new Date(birthdate).toLocaleDateString("en-PH") : "—"}
          </strong>{" "}
          in <strong className="text-dark">{zonePurok}</strong>. If that matches
          a row above, it is the same person — cancel and use that record instead.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-full border border-gray py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
          >
            Cancel — this is the same person
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="flex-1 cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Different person — register anyway"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
