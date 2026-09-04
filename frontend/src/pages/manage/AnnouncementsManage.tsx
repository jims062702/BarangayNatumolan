import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { Announcement } from "../../types";

const CATEGORIES = ["News", "Advisory", "Event", "Health", "Youth"];

/**
 * "YYYY-MM-DD" for a date input, taken from the stored string rather than via
 * `new Date(...)` — parsing a UTC timestamp and formatting it back locally
 * shifts the day by one in PH time.
 */
const asDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

export default function AnnouncementsManage() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [open, setOpen] = useState(false);
  // null = creating a new post; an id = correcting an existing one.
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get("/sk/announcements", { params: { page } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  /* Fields are filled in when the dialog OPENS, so a half-typed post never
     leaks into the next one after closing. */
  const openAdd = () => {
    setEditId(null);
    setTitle("");
    setBody("");
    setCategory(CATEGORIES[0]);
    setLocation("");
    setEventAt("");
    setEventTime("");
    setImage(null);
    setCurrentImage(null);
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    setTitle(a.title);
    setBody(a.body ?? "");
    setCategory(a.category);
    setLocation(a.location ?? "");
    setEventAt(asDateInput(a.event_at));
    setEventTime(a.event_time ?? "");
    setImage(null);
    setCurrentImage(a.image_url ?? null);
    setOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("body", body);
      form.append("category", category);
      // Sent even when blank so clearing a field actually clears it.
      form.append("location", location);
      form.append("event_at", eventAt);
      form.append("event_time", eventTime);
      if (image) form.append("image", image);
      form.append("is_published", "1");

      if (editId) {
        // Multipart cannot be sent as a real PUT through PHP — Laravel reads
        // the method from this field instead.
        form.append("_method", "PUT");
        await api.post(`/sk/announcements/${editId}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast("Post updated — the public site now shows the correction.");
      } else {
        await api.post("/sk/announcements", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast("Posted — it now appears in the News & Announcement section.");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (announcement: Announcement) => {
    if (
      !(await confirmAction({
        title: "Delete announcement?",
        text: `"${announcement.title}" will be removed from the public site.`,
        confirmText: "Yes, delete",
        danger: true,
      }))
    )
      return;
    try {
      await api.delete(`/sk/announcements/${announcement.id}`);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.post("/sk/announcements/reorder", { ids });
    load();
  };

  return (
    <div>
      <PageHeader
        title="News & Announcements"
        subtitle="Posts shown in the landing page News section and the resident portal"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New post
          </button>
        }
      />

      <Card>
        <DataTable
          columns={[
            {
              header: "Title",
              render: (a: Announcement) => (
                <div className="flex items-center gap-3">
                  <span className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {a.image_url && <img src={a.image_url} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="font-medium text-dark">{a.title}</span>
                </div>
              ),
            },
            { header: "Category", render: (a: Announcement) => a.category },
            {
              header: "When",
              render: (a: Announcement) =>
                a.event_at
                  ? `${new Date(a.event_at).toLocaleDateString("en-PH")}${a.event_time ? ` · ${a.event_time}` : ""}`
                  : "—",
            },
            {
              header: "Order",
              render: (a: Announcement) => {
                const index = rows.findIndex((r) => r.id === a.id);
                return (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      title="Show earlier"
                      className="cursor-pointer rounded-md border border-gray px-2 py-0.5 text-xs font-semibold text-dark hover:border-primary hover:text-primary disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      title="Show later"
                      className="cursor-pointer rounded-md border border-gray px-2 py-0.5 text-xs font-semibold text-dark hover:border-primary hover:text-primary disabled:opacity-30"
                    >
                      ↓
                    </button>
                    {index === 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        First
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              header: "Actions",
              render: (a: Announcement) => (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="cursor-pointer rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    className="cursor-pointer rounded-full border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          searchable
          searchPlaceholder="Search announcements…"
          getSearchText={(a) => `${a.title} ${a.category} ${a.body ?? ""}`}
          filters={[{ label: "Category", getValue: (a) => a.category }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit News / Announcement" : "New News / Announcement"}
        wide
      >
        <form onSubmit={save} className="space-y-4">
          <FormField label="Title" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="Details" required>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} className={`${inputClasses} resize-none`} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" required>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClasses}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Date">
              <input type="date" value={eventAt} onChange={(e) => setEventAt(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Time">
              <input value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={inputClasses} placeholder="9:00 AM – 12:00 NN" />
            </FormField>
          </div>
          <FormField
            label={editId ? "Replace photo (optional)" : "Photo (optional)"}
            hint={
              editId
                ? "Leave this empty to keep the photo already on the post."
                : "Shown on the News card. JPG/PNG up to 5MB."
            }
          >
            <div className="space-y-2">
              {editId && currentImage && (
                <div className="flex items-center gap-3">
                  <img
                    src={currentImage}
                    alt="Current photo on this post"
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                  />
                  <span className="text-xs text-gray-500">Photo currently in use</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
              />
            </div>
          </FormField>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? (editId ? "Saving…" : "Posting…") : editId ? "Save changes" : "Post"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
