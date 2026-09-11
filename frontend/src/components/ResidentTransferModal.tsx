import { useEffect, useState, useRef } from "react";
import { FiDownload, FiFileText, FiAlertTriangle, FiCheck } from "react-icons/fi";
import { api, errorMessage } from "../lib/api";
import { toast } from "../lib/toast";
import { confirmAction } from "../lib/confirm";
import Modal from "./UI/Modal";
import { inputClasses } from "./UI/FormField";
import type { Resident } from "../types";
import SearchInput from "../components/UI/SearchInput";

const PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5"];

const SECTORS = [
  "Senior Citizen", "PWD", "Solo Parent", "Youth", "Child",
  "Children Under Five", "Adult", "4Ps Household", "Indigent",
];

/**
 * Getting the register in and out as a spreadsheet.
 *
 * The import half never runs blind. The office is handing this system a file
 * from somewhere else — another barangay's export, a list typed up in Excel,
 * last year's backup — and a preview is the only chance anybody gets to look
 * before four hundred records change. So the flow is fixed: choose a file,
 * read what WOULD happen, then decide.
 */

interface PreviewRow {
  line: number;
  name: string;
  action: "create" | "update";
  matched_number?: string | null;
  /** A household number this row would bring into being, if it names one. */
  new_household?: string | null;
  problems: string[];
}

interface Preview {
  rows: PreviewRow[];
  summary: {
    total: number;
    create: number;
    update: number;
    errors: number;
    new_households: number;
  };
}

/**
 * Downloads through the API client, not a bare link.
 *
 * The export needs the bearer token, and an <a href> carries no headers —
 * it would come back as a 401 page saved with a .csv name, which looks like
 * a corrupt download rather than a permissions problem.
 */
async function download(path: string, fallbackName: string) {
  const response = await api.get(path, { responseType: "blob" });

  const disposition = String(response.headers["content-disposition"] ?? "");
  const named = /filename="?([^"]+)"?/.exec(disposition);

  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = named?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ResidentTransferModal({
  open,
  mode,
  onClose,
  onImported,
}: {
  open: boolean;
  /**
   * One job per opening.
   *
   * Taking data out and bringing data in are different errands, and the
   * second one writes. Putting both behind one button meant a clerk who
   * came to fetch a backup was one mis-click from a file upload — so they
   * are separate buttons, and each opens on the thing it says.
   */
  mode: "import" | "export";
  onClose: () => void;
  onImported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<"residents" | "non-residents" | "both">("residents");
  const [search, setSearch] = useState("");
  const [purok, setPurok] = useState("");
  const [sector, setSector] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  /*
   * The first few of them, by name.
   *
   * A count answers "how many" and not "which", and "which" is the question
   * somebody has when they typed a surname and eight people share it.
   */
  const [matches, setMatches] = useState<Resident[]>([]);
  const [counting, setCounting] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * The count comes from the residents list, not a second endpoint written
   * for it — one query, so the number on screen and the rows in the file
   * cannot drift apart.
   */
  useEffect(() => {
    if (!open || mode !== "export") return;

    setCounting(true);
    const timer = setTimeout(() => {
      api
        /* Six of them: enough to recognise a wrong filter, few enough that
           the dialogue does not become a second resident list. */
        .get("/residents", { params: { ...exportParams(), per_page: 6 } })
        .then((r) => {
          setMatchCount(r.data.data.total ?? 0);
          setMatches(r.data.data.data ?? []);
        })
        .catch(() => {
          setMatchCount(null);
          setMatches([]);
        })
        .finally(() => setCounting(false));
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, who, search, purok, sector]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const close = () => { reset(); onClose(); };

  /** One place decides what "who + filters" means, so the count and the file agree. */
  const exportParams = () => ({
    record_type: who === "non-residents" ? "Non-resident" : undefined,
    include_non_residents: who === "both" ? 1 : undefined,
    search: search.trim() || undefined,
    zone_purok: purok || undefined,
    sector: sector || undefined,
  });

  const runExport = async () => {
    setBusy(true);
    try {
      const query = new URLSearchParams(
        Object.entries({ ...exportParams(), format })
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString();

      await download(`/residents-export?${query}`, `residents.${format}`);
      toast(`${matchCount} record(s) exported.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (chosen: File) => {
    setBusy(true);
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", chosen);
      const response = await api.post("/residents-import/preview", body);
      setPreview(response.data.data);
    } catch (err) {
      toast(errorMessage(err), "error");
      reset();
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!file || !preview) return;

    const { create, update, errors, new_households: households } = preview.summary;

    /* Both facts, in the order they matter. A household created by mistake
       is harder to notice afterwards than a resident, because nothing is
       obviously wrong about it. */
    const consequences = [
      households ? `${households} new household(s) will be created.` : "",
      errors ? `${errors} row(s) with problems will be skipped.` : "",
    ].filter(Boolean);

    if (
      !(await confirmAction({
        title: `Import ${create} new and ${update} updated record(s)?`,
        text: consequences.length
          ? consequences.join(" ")
          : "This writes to the resident registry.",
        confirmText: "Yes, import",
      }))
    )
      return;

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      // Said explicitly, because the preview showed exactly what will be
      // skipped and the clerk has now seen it.
      if (errors) body.append("skip_bad_rows", "1");

      const response = await api.post("/residents-import", body);
      toast(response.data.message);
      reset();
      onImported();
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    /*
      Wide, because both halves are lists.

      The preview is a table of names against what would happen to each, and
      a clerk deciding whether to run it has to be able to read it. In a
      narrow box the names wrapped onto three lines and four rows filled the
      window — which is a preview nobody can check.
    */
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title={mode === "export" ? "Export resident data" : "Import resident data"}
    >
      <div className="space-y-5">
        {/* ---------------- export ---------------- */}
        {mode === "export" && (
        <section className="space-y-4">
          <p className="text-xs leading-relaxed text-gray-500">
            A backup, or the barangay&rsquo;s data for somebody who asked for it. Narrow it
            down first, or take the lot — and check the names below before you do.
          </p>

          {/*
            Who. Three answers, because "residents" and "everybody" are not
            the same question and the third — non-residents alone — is the
            one somebody asks when they want the family members recorded
            from outside the barangay.
          */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-dark">Who to include</p>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "residents", label: "Residents only" },
                { value: "non-residents", label: "Non-residents only" },
                { value: "both", label: "Both" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWho(option.value)}
                  aria-pressed={who === option.value}
                  className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    who === option.value
                      ? "bg-primary text-white"
                      : "bg-secondary text-dark hover:bg-primary/10"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/*
            The same three filters the registry list has, so what a clerk
            searched for on screen is what they can take away.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SearchInput
              value={search}
              onChange={(value) => setSearch(value)}
              placeholder="Search a name or number…"
              label="Search"
              className="max-w-sm flex-1"
            />
            <select
              value={purok}
              onChange={(e) => setPurok(e.target.value)}
              aria-label="Purok"
              className={inputClasses}
            >
              <option value="">Purok: All</option>
              {PUROKS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              aria-label="Sector"
              className={inputClasses}
            >
              <option value="">Sector: All</option>
              {SECTORS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          {/*
            Who is actually in the file.

            A count alone answers "how many" and not "which" — and "which" is
            the question somebody has when they typed a surname and eight
            people share it. Seeing the names is the only chance anybody gets
            to notice they are about to hand out the wrong eight.
          */}
          <div className="rounded-xl border border-gray bg-secondary/40 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-dark">
                {counting ? (
                  <span className="text-gray-500">Counting…</span>
                ) : (
                  <>
                    <span className="font-bold">{matchCount ?? 0}</span>{" "}
                    <span className="text-gray-500">
                      {matchCount === 1 ? "record matches" : "records match"}
                    </span>
                  </>
                )}
              </p>
              {(search || purok || sector) && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setPurok(""); setSector(""); }}
                  className="cursor-pointer rounded-full border border-gray bg-white px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
                >
                  Clear filters
                </button>
              )}
            </div>

            {!counting && matches.length > 0 && (
              <ul className="divide-y divide-gray/60 rounded-lg bg-white">
                {matches.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                    <span className="font-medium text-dark">
                      {person.last_name}, {person.first_name}
                      {person.middle_name ? ` ${person.middle_name}` : ""}
                    </span>
                    <span className="text-xs text-gray-400">{person.resident_number}</span>
                    {person.zone_purok && (
                      <span className="text-xs text-gray-400">{person.zone_purok}</span>
                    )}
                    {person.birthdate && (
                      <span className="ml-auto text-xs text-gray-400">
                        born {person.birthdate.slice(0, 10)}
                      </span>
                    )}
                  </li>
                ))}

                {/*
                  Named exactly. "and more" leaves the reader guessing whether
                  it is two or two thousand, which is the number that decides
                  whether they check.
                */}
                {(matchCount ?? 0) > matches.length && (
                  <li className="px-3 py-2 text-xs text-gray-500">
                    …and {(matchCount ?? 0) - matches.length} more, all in the file.
                  </li>
                )}
              </ul>
            )}

            {!counting && matchCount === 0 && (
              <p className="rounded-lg bg-white px-3 py-3 text-sm text-gray-400">
                Nobody matches these filters. Nothing would be in the file.
              </p>
            )}
          </div>

          {/*
            Two formats, and CSV stays the default.

            CSV is the one every spreadsheet on earth opens, and a file the
            office cannot open is not a backup. But a clerk who is only ever
            going to open this in Excel should not answer an import dialogue
            about delimiters every time, so the other is right there.
          */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1.5 text-sm font-medium text-dark">File format</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "csv", label: "CSV", note: "Opens anywhere" },
                  { value: "xlsx", label: "Excel", note: ".xlsx" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    aria-pressed={format === option.value}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                      format === option.value
                        ? "bg-primary text-white"
                        : "bg-secondary text-dark hover:bg-primary/10"
                    }`}
                  >
                    {format === option.value && (
                      <FiCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    {option.label}
                    <span className="font-normal opacity-70">{option.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={busy || counting || !matchCount}
              onClick={runExport}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              <FiDownload className="h-4 w-4" aria-hidden="true" />
              {matchCount
                ? `Export ${matchCount} as ${format === "xlsx" ? "Excel" : "CSV"}`
                : "Nothing to export"}
            </button>
          </div>
        </section>
        )}

        {/* ---------------- import ---------------- */}
        {mode === "import" && (
        <section>
          <p className="mb-1 text-sm font-semibold text-dark">Bring data in</p>
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            A CSV or an Excel file. Nothing is saved until you have seen what it would do: a
            row that matches somebody already on the register updates them;{" "}
            <strong className="text-dark">an empty cell changes nothing</strong> — it is read as
            &ldquo;not filled in&rdquo;, never as &ldquo;clear this&rdquo;.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              /* Either of the two the export writes — a file this system
                 handed out should be a file it takes back. */
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen) void runPreview(chosen);
              }}
              className="max-w-xs flex-1 cursor-pointer rounded-xl border border-gray bg-white px-3 py-2 text-xs file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-dark"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => download("/residents-import/template", "resident-import-template.csv")}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray bg-white px-4 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary disabled:opacity-60"
            >
              <FiFileText className="h-3.5 w-3.5" aria-hidden="true" /> Blank template
            </button>
          </div>

          {busy && !preview && (
            <p className="mt-3 text-xs text-gray-500">Reading the file…</p>
          )}

          {preview && (
            <div className="mt-4 rounded-xl border border-gray bg-secondary/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                What this file would do
              </p>

              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <span>
                  <span className="font-bold text-dark">{preview.summary.create}</span>{" "}
                  <span className="text-gray-500">new</span>
                </span>
                <span>
                  <span className="font-bold text-dark">{preview.summary.update}</span>{" "}
                  <span className="text-gray-500">updated</span>
                </span>
                {preview.summary.new_households > 0 && (
                  <span>
                    <span className="font-bold text-dark">{preview.summary.new_households}</span>{" "}
                    <span className="text-gray-500">
                      new household{preview.summary.new_households === 1 ? "" : "s"}
                    </span>
                  </span>
                )}
                {preview.summary.errors > 0 && (
                  <span className="text-danger">
                    <span className="font-bold">{preview.summary.errors}</span> with problems
                  </span>
                )}
              </div>

              {/*
                Every household about to be created, by number.

                A household number that is not on the register is not an
                error — the office is importing so that things get onto the
                register. But it is one typo away from another number, and a
                typo would otherwise quietly found a household containing one
                person for ever. So they are named, while nothing is written.
              */}
              {preview.summary.new_households > 0 && (
                <div className="mb-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800">
                    These household numbers are not on the register yet and will be created:
                  </p>
                  <p className="mt-1 text-xs text-amber-900">
                    {[...new Set(
                      preview.rows
                        .filter((row) => row.new_household && row.problems.length === 0)
                        .map((row) => row.new_household as string)
                    )].join(", ")}
                  </p>
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Check them against the register first — a mistyped number makes a household
                    of its own.
                  </p>
                </div>
              )}

              {/*
                The bad rows first and in full. A clerk deciding whether to
                skip them needs to read them, and burying them under two
                hundred good rows is the same as not showing them.
              */}
              {preview.summary.errors > 0 && (
                <div className="mb-3 space-y-1.5">
                  {preview.rows
                    .filter((r) => r.problems.length > 0)
                    .slice(0, 15)
                    .map((r) => (
                      <div key={r.line} className="flex gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs">
                        <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
                        <span>
                          <span className="font-semibold text-dark">
                            Line {r.line}
                            {r.name ? ` · ${r.name}` : ""}
                          </span>
                          <span className="block text-gray-600">{r.problems.join(" ")}</span>
                        </span>
                      </div>
                    ))}
                  {preview.summary.errors > 15 && (
                    <p className="text-xs text-gray-500">
                      …and {preview.summary.errors - 15} more.
                    </p>
                  )}
                </div>
              )}

              <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-gray bg-white">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.rows.slice(0, 100).map((r) => (
                      <tr key={r.line} className="border-b border-gray last:border-0">
                        <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                        <td className="px-3 py-1.5 font-medium text-dark">{r.name || "—"}</td>
                        <td className="px-3 py-1.5">
                          {r.problems.length > 0 ? (
                            <span className="text-danger">skipped</span>
                          ) : r.action === "update" ? (
                            <span className="text-gray-500">
                              updates {r.matched_number ?? "an existing record"}
                            </span>
                          ) : (
                            <span className="text-success">new</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={busy || preview.summary.create + preview.summary.update === 0}
                onClick={runImport}
                className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {preview.summary.create + preview.summary.update === 0 ? (
                  "Nothing here can be imported"
                ) : (
                  <>
                    <FiCheck className="h-4 w-4" aria-hidden="true" />
                    Import {preview.summary.create + preview.summary.update} record(s)
                    {preview.summary.errors > 0 && `, skip ${preview.summary.errors}`}
                  </>
                )}
              </button>
            </div>
          )}
        </section>
        )}
      </div>
    </Modal>
  );
}
