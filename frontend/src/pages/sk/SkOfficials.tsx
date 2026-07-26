import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { Official } from "../../types";

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
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const load = () => {
    setLoading(true);
    api.get("/sk/officials").then((r) => setOfficials(r.data.data ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

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
    setSaving(true);
    setFeedback("");
    try {
      const body = new FormData();
      body.append("group", form.group);
      body.append("position", form.position);
      body.append("name", form.name);
      if (form.term) body.append("term", form.term);
      if (form.photo) body.append("photo", form.photo);

      if (form.id) {
        body.append("_method", "PUT");
        await api.post(`/sk/officials/${form.id}`, body, { headers: { "Content-Type": "multipart/form-data" } });
        setFeedback("Official updated.");
      } else {
        await api.post("/sk/officials", body, { headers: { "Content-Type": "multipart/form-data" } });
        setFeedback("Official added — now shown on the public site.");
      }
      setOpen(false);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (official: Official) => {
    if (!window.confirm(`Remove ${official.name}?`)) return;
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
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Add official
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
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
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setForm((prev) => ({ ...prev, photo: e.target.files?.[0] ?? null }))}
              className="block w-full text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
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
