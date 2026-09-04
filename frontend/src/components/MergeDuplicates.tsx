import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiCheckCircle, FiHelpCircle, FiRotateCcw, FiUsers } from "react-icons/fi";
import Swal from "sweetalert2";
import { api, errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { confirmAction } from "../lib/confirm";
import Card from "./UI/Card";
import type { Resident } from "../types";

/**
 * "This may be the same person" — duplicate detection, evidence, and repair.
 *
 * A split record is the worst kind of registry error, because nothing looks
 * broken: each half is a perfectly valid resident. The damage shows up
 * somewhere else entirely — a resident signs in and their family is missing,
 * because the family was linked to the other copy of them.
 *
 * The hard part is not finding candidates, it is deciding. Two unrelated
 * people really can share a name AND a birthday, so this never asserts more
 * than the evidence supports: it states a verdict, shows exactly what differs
 * between the two records, and where it genuinely cannot tell, it says so and
 * names the field that would settle it.
 */

interface Difference {
  label: string;
  keeper?: string | null;
  duplicate?: string | null;
}

export interface DuplicateCandidate {
  id: number;
  resident_number: string;
  first_name: string;
  middle_name?: string | null;
  mother_maiden_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birthdate?: string | null;
  birth_place?: string | null;
  zone_purok?: string | null;
  email?: string | null;
  is_active: boolean;
  match_reason: "name" | "birthdate" | "both";
  /** How sure we are, which decides what the clerk is allowed to do. */
  confidence: "confirmed" | "likely" | "unknown" | "different_person";
  verdict: string;
  differences?: Difference[];
}

interface ReversibleMerge {
  id: number;
  duplicate: { id: number; resident_number: string; first_name: string; last_name: string } | null;
  notes?: string[] | null;
  merged_at: string;
  moved_total: number;
}

const TONE: Record<DuplicateCandidate["confidence"], { box: string; chip: string; icon: typeof FiAlertTriangle }> = {
  confirmed: {
    box: "border-danger/40 bg-danger/5",
    chip: "bg-danger/15 text-danger",
    icon: FiAlertTriangle,
  },
  likely: {
    box: "border-warning/40 bg-warning/5",
    chip: "bg-warning/15 text-warning",
    icon: FiAlertTriangle,
  },
  unknown: {
    box: "border-warning/40 bg-warning/5",
    chip: "bg-warning/15 text-warning",
    icon: FiHelpCircle,
  },
  different_person: {
    box: "border-gray bg-white",
    chip: "bg-success/10 text-success",
    icon: FiCheckCircle,
  },
};

const LABEL: Record<DuplicateCandidate["confidence"], string> = {
  confirmed: "Same person",
  likely: "Probably the same person",
  unknown: "Cannot tell — evidence missing",
  different_person: "Different person",
};

const fullName = (c: { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null }) =>
  [c.first_name, c.middle_name, c.last_name, c.suffix].filter(Boolean).join(" ");

interface Props {
  resident: Resident;
  /** Reload the profile after a merge or an undo. */
  onMerged: () => void;
}

export default function MergeDuplicates({ resident, onMerged }: Props) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [reversible, setReversible] = useState<ReversibleMerge[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/residents/${resident.id}/duplicates`)
      .then((r) => setCandidates(r.data.data ?? []))
      .catch(() => setCandidates([]));
    api
      .get(`/residents/${resident.id}/merges`)
      .then((r) => setReversible(r.data.data ?? []))
      .catch(() => setReversible([]));
  }, [resident.id]);

  useEffect(() => {
    setCandidates([]);
    setReversible([]);
    load();
  }, [load]);

  if (candidates.length === 0 && reversible.length === 0) return null;

  const merge = async (candidate: DuplicateCandidate) => {
    const keeper = `${resident.first_name} ${resident.last_name} (${resident.resident_number})`;

    // What the clerk is being asked to accept changes with how sure we are.
    const caution =
      candidate.confidence === "unknown"
        ? `<div style="background:#FEF3C7;border-radius:10px;padding:10px 12px;margin:10px 0">
             <b>You are merging without the deciding evidence.</b> These two share a name and a
             birthday, and neither record has the mother's maiden name. If they turn out to be two
             different people, you will have to undo this.
           </div>`
        : candidate.confidence === "different_person"
          ? `<div style="background:#FEE2E2;border-radius:10px;padding:10px 12px;margin:10px 0">
               <b>The records say these are DIFFERENT people</b> — their mothers' maiden names do not
               match. Merge only if you know the mother's name on one of them is wrong.
             </div>`
          : "";

    const result = await Swal.fire({
      title: "Merge these two records?",
      html:
        `<div style="text-align:left;font-size:14px;line-height:1.7">` +
        caution +
        `Everything on <b>${fullName(candidate)}</b> (${candidate.resident_number}) — certificates, ` +
        `requests, family links, household, sectors and their portal login — moves onto ` +
        `<b>${keeper}</b>.<br><br>` +
        `The duplicate is <b>deactivated, not deleted</b>, so certificates already issued under ` +
        `its number stay verifiable.<br><br>` +
        `<b>You can undo this</b> from this page afterwards.` +
        `</div>`,
      icon: candidate.confidence === "different_person" ? "error" : "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, merge them",
      cancelButtonText: "Cancel",
      confirmButtonColor: candidate.confidence === "different_person" ? "#DC2626" : "#723EC3",
      cancelButtonColor: "#6B7280",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setBusy(true);
    try {
      const response = await api.post(`/residents/${resident.id}/merge`, {
        duplicate_id: candidate.id,
      });
      toast(response.data.message);
      onMerged();
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const undo = async (record: ReversibleMerge) => {
    if (
      !(await confirmAction({
        title: "Undo this merge?",
        text: `${record.duplicate ? fullName(record.duplicate) : "The duplicate"} becomes its own active record again, and everything this merge moved goes back to it.`,
        confirmText: "Yes, undo it",
        danger: true,
      }))
    )
      return;

    setBusy(true);
    try {
      const response = await api.post(`/residents/${resident.id}/merges/${record.id}/undo`);
      toast(response.data.message);
      onMerged();
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Possible duplicate records">
      {candidates.length > 0 && (
        <>
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-secondary/70 px-4 py-3 text-sm leading-relaxed text-gray-600">
            <FiUsers aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              {candidates.length === 1 ? "Another record" : `${candidates.length} other records`} share
              enough with this one to be worth checking. Read the verdict and the differences before
              deciding — a barangay is full of genuine namesakes.
            </span>
          </p>

          <div className="space-y-3">
            {candidates.map((candidate) => {
              const tone = TONE[candidate.confidence];
              const Icon = tone.icon;
              const canMerge = candidate.confidence !== "different_person";

              return (
                <div key={candidate.id} className={`rounded-xl border p-4 ${tone.box}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/residents/${candidate.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {fullName(candidate)}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {candidate.resident_number}
                        {candidate.birthdate &&
                          ` · born ${new Date(candidate.birthdate).toLocaleDateString("en-PH")}`}
                        {candidate.zone_purok && ` · ${candidate.zone_purok}`}
                        {!candidate.is_active && " · inactive"}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${tone.chip}`}
                    >
                      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                      {LABEL[candidate.confidence]}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-dark">{candidate.verdict}</p>

                  {(candidate.differences?.length ?? 0) > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-gray/70 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-secondary/70">
                          <tr>
                            <th className="px-3 py-1.5 font-semibold text-gray-500">Field</th>
                            <th className="px-3 py-1.5 font-semibold text-gray-500">This record</th>
                            <th className="px-3 py-1.5 font-semibold text-gray-500">The other</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray/60">
                          {candidate.differences?.map((d) => (
                            <tr key={d.label}>
                              <td className="px-3 py-1.5 font-medium text-dark">{d.label}</td>
                              <td className="px-3 py-1.5 text-gray-600">{d.keeper || "—"}</td>
                              <td className="px-3 py-1.5 text-gray-600">{d.duplicate || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3">
                    {canMerge ? (
                      <button
                        type="button"
                        onClick={() => merge(candidate)}
                        disabled={busy}
                        className="cursor-pointer rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                      >
                        Merge into this record
                      </button>
                    ) : (
                      <p className="text-xs font-medium text-gray-500">
                        No action needed — leave both records as they are.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {reversible.length > 0 && (
        <div className={candidates.length > 0 ? "mt-5" : ""}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Merges absorbed by this record
          </p>
          <div className="space-y-2">
            {reversible.map((record) => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark">
                    {record.duplicate ? fullName(record.duplicate) : "A duplicate record"}
                    {record.duplicate && (
                      <span className="text-xs font-normal text-gray-500">
                        {" "}
                        ({record.duplicate.resident_number})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {record.moved_total} record(s) moved ·{" "}
                    {new Date(record.merged_at).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => undo(record)}
                  disabled={busy}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-gray px-4 py-2 text-xs font-semibold text-dark transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  <FiRotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Undo this merge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
