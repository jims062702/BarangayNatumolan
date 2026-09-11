import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FiPlus } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import { useUpload } from "../../hooks/useUpload";
import FileField from "../../components/UI/FileField";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { Official } from "../../types";
import { CardGridSkeleton } from "../../components/UI/Skeleton";

type Group = "Barangay" | "SK";

const POSITIONS: Record<Group, string[]> = {
  Barangay: ["Punong Barangay", "Barangay Kagawad", "Barangay Secretary", "Barangay Treasurer"],
  SK: ["SK Chairperson", "SK Kagawad", "SK Secretary", "SK Treasurer"],
};

// Maximum holders allowed per position.
const LIMITS: Record<string, number> = {
  "Punong Barangay": 1,
  "Barangay Kagawad": 7,
  "Barangay Secretary": 1,
  "Barangay Treasurer": 1,
  "SK Chairperson": 1,
  "SK Kagawad": 7,
  "SK Secretary": 1,
  "SK Treasurer": 1,
};

interface FormState {
  id?: number;
  group: Group;
  position: string;
  name: string;
  term: string;
  photo: File | null;
}

const EMPTY: FormState = { group: "Barangay", position: "", name: "", term: "2023 – 2026", photo: null };

export default function SkOfficials() {
  const [officials, setOfficials] = useState<Official[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  /*
   * `silent` is for the background timer.
   *
   * A refresh nobody asked for must not blank the page somebody is
   * reading; a first load or a filter change should still say it is
   * working. Same fetch, and only the announcement differs.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.get("/sk/officials").then((r) => setOfficials(r.data.data ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Live updates without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("officials", () => load(true));

  /* Progress for the photo, so a slow upload is not mistaken for a dead one. */
  const upload = useUpload();

  // Positions still available for the chosen group (hide any at their limit).
  const availablePositions = useMemo(() => {
    return POSITIONS[form.group].filter((p) => {
      const max = LIMITS[p] ?? Infinity;
      const count = officials.filter(
        (o) => o.group === form.group && o.id !== form.id && o.position === p
      ).length;
      return count < max;
    });
  }, [officials, form.group, form.id]);

  const openAdd = () => {
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (o: Official) => {
    setForm({
      id: o.id,
      group: o.group,
      position: o.position,
      name: o.name,
      term: o.term ?? "",
      photo: null,
    });
    setOpen(true);
  };

  // Keep position valid whenever the group or available list changes.
  useEffect(() => {
    if (!open) return;
    if (!availablePositions.includes(form.position)) {
      setForm((prev) => ({ ...prev, position: availablePositions[0] ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.group, open]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Save this official?", confirmText: "Yes, save" }))) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append("group", form.group);
      body.append("position", form.position);
      body.append("name", form.name);
      if (form.term) body.append("term", form.term);
      if (form.photo) body.append("photo", form.photo);

      if (form.id) {
        body.append("_method", "PUT");
        await api.post(`/sk/officials/${form.id}`, body, {
          headers: { "Content-Type": "multipart/form-data" },
          ...upload.tracker,
        });
        upload.finish();
        toast("Official updated.");
      } else {
        await api.post("/sk/officials", body, {
          headers: { "Content-Type": "multipart/form-data" },
          ...upload.tracker,
        });
        upload.finish();
        toast("Official added — now shown on the public site.");
      }
      setOpen(false);
      load();
    } catch (err) {
      /* Clear the bar. Left up, a failed upload sits at whatever percentage
         it died on and reads as still working. */
      upload.fail();
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (official: Official) => {
    if (
      !(await confirmAction({
        title: "Remove official?",
        text: `${official.name} will be removed from the officials list.`,
        confirmText: "Yes, remove",
        danger: true,
      }))
    )
      return;
    await api.delete(`/sk/officials/${official.id}`);
    load();
  };

  const renderGroup = (g: Group) => {
    const rows = officials.filter((o) => o.group === g);
    return (
      <Card title={g === "SK" ? "Sangguniang Kabataan Officials" : "Barangay Officials"}>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">None listed.</p>
        ) : (
          <ul className="divide-y divide-gray/70">
            {rows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {o.photo_url ? (
                    <img src={o.photo_url} alt={o.name} className="h-full w-full object-cover" />
                  ) : (
                    o.name.charAt(0)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-dark">{o.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {o.position} · {o.term ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(o)}
                  className="shrink-0 cursor-pointer text-xs font-semibold text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(o)}
                  className="shrink-0 cursor-pointer text-xs font-semibold text-danger hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title="Officials"
        subtitle="Barangay and SK officials shown on the public landing page"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> Add official
          </button>
        }
      />

      {loading ? (
        <CardGridSkeleton cards={2} height={200} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {renderGroup("Barangay")}
          {renderGroup("SK")}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Official" : "Add Official"}>
        <form onSubmit={save} className="space-y-4">
          <FormField label="Group" required>
            <select
              value={form.group}
              onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value as Group }))}
              className={inputClasses}
            >
              <option value="Barangay">Barangay Officials</option>
              <option value="SK">Sangguniang Kabataan</option>
            </select>
          </FormField>
          <FormField label="Position" required hint="Per group: 1 head, up to 7 kagawads, 1 secretary, 1 treasurer. Filled positions are hidden.">
            <select
              value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              required
              className={inputClasses}
            >
              {availablePositions.length === 0 && <option value="">No positions available</option>}
              {availablePositions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Full name" required>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required className={inputClasses} />
          </FormField>
          <FormField label="Term">
            <input value={form.term} onChange={(e) => setForm((prev) => ({ ...prev, term: e.target.value }))} className={inputClasses} />
          </FormField>
          <FormField label={form.id ? "Replace photo (optional)" : "Photo (optional)"} hint="JPG/PNG up to 5MB">
            <FileField
              file={form.photo}
              onPick={(photo) => setForm((prev) => ({ ...prev, photo }))}
              progress={upload.progress}
              done={upload.done}
            />
          </FormField>
          <button
            type="submit"
            disabled={saving || !form.position}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Add official"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
