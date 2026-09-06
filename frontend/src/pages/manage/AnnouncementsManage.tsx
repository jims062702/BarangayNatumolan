import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FiArrowDown, FiArrowUp, FiCheck, FiEdit2, FiImage, FiPlus, FiTrash2, FiUser,
} from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import RowAction, { RowActions } from "../../components/UI/RowAction";
import FormField, { inputClasses } from "../../components/UI/FormField";
import {
  KIND,
  KIND_FIELDS,
  POST_KINDS,
  URGENCIES,
  kindOf,
  whenOf,
  type PostKind,
} from "../../lib/postKinds";
import type { Announcement } from "../../types";

const STATUSES = ["Draft", "Published", "Archived"] as const;

/**
 * "YYYY-MM-DD" for a date input, taken from the stored string rather than via
 * `new Date(...)` — parsing a UTC timestamp and formatting it back locally
 * shifts the day by one in PH time.
 */
const asDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

/** A sensible byline for whoever is posting, so the field is rarely empty. */
function bylineFor(office?: string | null, role?: string | null): string {
  if (office === "SK") return "SK Secretary";
  if (office) return `${office} Office`;

  return role ?? "";
}

export default function AnnouncementsManage() {
  const { user } = useAuth();

  const [rows, setRows] = useState<Announcement[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [open, setOpen] = useState(false);
  // null = creating a new post; an id = correcting an existing one.
  const [editId, setEditId] = useState<number | null>(null);

  /* One object rather than eighteen useStates: the fields a post carries
     depend on its kind, and they are set and cleared together. */
  const blank = useMemo(
    () => ({
      title: "",
      body: "",
      excerpt: "",
      author_name: bylineFor(user?.office, user?.role),
      category: "Announcement" as PostKind,
      status: "Published" as (typeof STATUSES)[number],
      location: "",
      event_at: "",
      event_time: "",
      organizer: "",
      contact_info: "",
      registration_deadline: "",
      completed_at: "",
      participants: "",
      effective_at: "",
      expires_at: "",
      urgency: "",
    }),
    [user]
  );

  const [form, setForm] = useState(blank);
  const [image, setImage] = useState<File | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const set = (key: keyof typeof blank, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const kind = kindOf(form.category);
  const uses = (field: string) => KIND_FIELDS[kind].includes(field);

  const load = () => {
    setLoading(true);
    api
      .get("/sk/announcements", { params: { page, status: statusFilter || undefined } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
        setCounts(r.data.data.status_counts ?? {});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  /* Fields are filled in when the dialog OPENS, so a half-typed post never
     leaks into the next one after closing. */
  const openAdd = () => {
    setEditId(null);
    setForm(blank);
    setImage(null);
    setCurrentImage(null);
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    setForm({
      title: a.title,
      body: a.body ?? "",
      excerpt: a.excerpt ?? "",
      author_name: a.author_name ?? "",
      category: kindOf(a.category),
      status: (a.status ?? "Published") as (typeof STATUSES)[number],
      location: a.location ?? "",
      event_at: asDateInput(a.event_at),
      event_time: a.event_time ?? "",
      organizer: a.organizer ?? "",
      contact_info: a.contact_info ?? "",
      registration_deadline: asDateInput(a.registration_deadline),
      completed_at: asDateInput(a.completed_at),
      participants: a.participants ?? "",
      effective_at: asDateInput(a.effective_at),
      expires_at: asDateInput(a.expires_at),
      urgency: a.urgency ?? "",
    });
    setImage(null);
    setCurrentImage(a.image_url ?? null);
    setOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = new FormData();

      /*
       * Everything is sent, blanks included, so clearing a field actually
       * clears it. The server then drops whatever does not belong to the
       * chosen kind — a post changed from Event to Announcement must not
       * keep a venue nobody can see to remove.
       */
      Object.entries(form).forEach(([key, value]) => {
        payload.append(key, typeof value === "boolean" ? (value ? "1" : "0") : value);
      });

      if (image) payload.append("image", image);

      if (editId) {
        // Multipart cannot be sent as a real PUT through PHP — Laravel reads
        // the method from this field instead.
        payload.append("_method", "PUT");
        await api.post(`/sk/announcements/${editId}`, payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast("Post updated — the public site now shows the correction.");
      } else {
        await api.post("/sk/announcements", payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast(
          form.status === "Published"
            ? "Posted — it now appears in News & Announcements."
            : "Saved as a draft. Nobody outside the office can see it yet."
        );
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
        title: "Delete this post?",
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
        subtitle="Announcements · Events · Activities · Advisories · Programs"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" /> New post
          </button>
        }
      />

      {/* Draft / Published / Archived, with how many are in each. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ label: "All posts", value: "" }, ...STATUSES.map((s) => ({ label: s, value: s }))].map(
          (chip) => (
            <button
              key={chip.value || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(chip.value);
                setPage(1);
              }}
              aria-pressed={statusFilter === chip.value}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                statusFilter === chip.value
                  ? "bg-primary text-white"
                  : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {chip.label}
              <span className="ml-1.5 opacity-70">
                {chip.value
                  ? (counts[chip.value] ?? 0)
                  : Object.values(counts).reduce((sum, n) => sum + n, 0)}
              </span>
            </button>
          )
        )}
      </div>

      <Card>
        <DataTable
          columns={[
            {
              header: "Post",
              render: (a: Announcement) => (
                <div className="flex items-start gap-3">
                  {/*
                    A fixed frame, and the photo cropped into it. A post
                    without one gets the placeholder rather than a hole, so
                    every row is the same height and the eye can run down the
                    titles instead of stepping over gaps.
                  */}
                  <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {a.image_url ? (
                      <img src={a.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                        <FiImage className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug text-dark">{a.title}</span>

                    {/*
                      The line under the title is what the card will show. It
                      is here so the office can see, without opening
                      anything, which posts are going out with a summary
                      lifted from the middle of a sentence.
                    */}
                    {(a.excerpt || a.body) && (
                      <span className="mt-0.5 line-clamp-1 block text-xs text-gray-500">
                        {a.excerpt || a.body}
                      </span>
                    )}

                    {(a.byline || a.author_name) && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <FiUser className="h-3 w-3" aria-hidden="true" />
                        {a.byline || a.author_name}
                      </span>
                    )}
                  </span>
                </div>
              ),
            },
            {
              header: "Kind",
              render: (a: Announcement) => (
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                    KIND[kindOf(a.category)].tone
                  }`}
                >
                  {kindOf(a.category)}
                </span>
              ),
            },
            { header: "Status", render: (a: Announcement) => <StatusBadge status={a.status} /> },
            {
              header: "When",
              /*
                A date on its own says nothing here: the same column holds an
                event that has not happened, an activity that has, and the day
                a notice went out. So the row says WHICH date it is.
              */
              render: (a: Announcement) => {
                const when = whenOf(a);
                if (!when) return <span className="text-gray-400">—</span>;

                const kind = kindOf(a.category);
                const label =
                  kind === "Event"
                    ? "Happens"
                    : kind === "Activity"
                      ? "Completed"
                      : kind === "Advisory"
                        ? "In effect"
                        : "Posted";

                return (
                  <span className="block">
                    <span className="block text-[11px] uppercase tracking-wide text-gray-400">
                      {label}
                    </span>
                    <span className="block text-sm text-dark">{when}</span>
                  </span>
                );
              },
            },
            {
              header: "Order",
              render: (a: Announcement) => {
                const index = rows.findIndex((r) => r.id === a.id);

                /* The same round icon buttons every other table uses, rather
                   than two little bordered squares of their own design. */
                return (
                  <RowActions>
                    <RowAction
                      label="Show earlier"
                      icon={FiArrowUp}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    />
                    <RowAction
                      label="Show later"
                      icon={FiArrowDown}
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                    />
                  </RowActions>
                );
              },
            },
            {
              header: "Actions",
              render: (a: Announcement) => (
                <RowActions>
                  <RowAction label="Edit post" icon={FiEdit2} onClick={() => openEdit(a)} />
                  <RowAction label="Delete post" icon={FiTrash2} tone="danger" onClick={() => remove(a)} />
                </RowActions>
              ),
            },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          numbered
          total={total}
          searchable
          searchPlaceholder="Search posts…"
          getSearchText={(a) =>
            `${a.title} ${a.category} ${a.status} ${a.byline ?? a.author_name ?? ""} ${a.excerpt ?? ""} ${a.body ?? ""}`
          }
          filters={[{ label: "Kind", getValue: (a) => kindOf(a.category) }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit post" : "New post"} wide>
        <form onSubmit={save} className="space-y-4">
          {/*
            The kind comes FIRST, because it decides what the rest of the form
            asks for. Chosen from a row rather than a dropdown so all five are
            visible at once with what each is for — the Event/Activity
            distinction is the one people get wrong, and it is not obvious
            from a closed list.
          */}
          <FormField label="What kind of post is this?" required plain>
            <div className="flex flex-wrap gap-2">
              {POST_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("category", k)}
                  aria-pressed={kind === k}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    kind === k
                      ? "bg-primary text-white ring-2 ring-primary/25"
                      : `${KIND[k].tone} hover:opacity-80`
                  }`}
                >
                  {/*
                    A tick on the chosen one.

                    Five chips already wear five colours to say what KIND they
                    are, so the chosen one being purple is one more colour
                    among colours — there is nothing to compare it against.
                    The tick says "this is the one" in a way that does not
                    depend on telling five shades apart.
                  */}
                  {kind === k && <FiCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {k}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">{KIND[kind].purpose}</p>
          </FormField>

          <FormField label="Title" required>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              maxLength={255}
              className={inputClasses}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Posted by" hint="The name residents see under the title.">
              <input
                value={form.author_name}
                onChange={(e) => set("author_name", e.target.value)}
                maxLength={120}
                placeholder="e.g. SK Secretary"
                className={inputClasses}
              />
            </FormField>
            <FormField label="Status" required>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={inputClasses}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            label="Short description"
            hint="One line, shown on the card. Left empty, the opening of the details is used."
          >
            <input
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              maxLength={300}
              className={inputClasses}
            />
          </FormField>

          <FormField label="Full details" required>
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              required
              rows={5}
              className={`${inputClasses} resize-none`}
            />
          </FormField>

          {/*
            Only the fields this KIND uses. An Announcement asked for a venue
            and an expiry date is a form nobody finishes, and the answers
            typed into boxes that do not apply are the ones that end up on the
            public page contradicting the post beside them.
          */}
          {KIND_FIELDS[kind].length > 0 && (
            <div className="rounded-xl border border-gray bg-secondary/40 p-4">
              <p className="mb-3 text-sm font-semibold text-dark">
                {kind === "Event" && "When and where it happens"}
                {kind === "Activity" && "When it was done"}
                {kind === "Advisory" && "How long it applies"}
                {kind === "Program" && "Where residents go for it"}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {uses("event_at") && (
                  <FormField label="Event date" hint="What a resident writes on their calendar.">
                    <input
                      type="date"
                      value={form.event_at}
                      onChange={(e) => set("event_at", e.target.value)}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("event_time") && (
                  <FormField label="Time">
                    <input
                      value={form.event_time}
                      onChange={(e) => set("event_time", e.target.value)}
                      maxLength={60}
                      placeholder="8:00 AM – 12:00 NN"
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("completed_at") && (
                  <FormField label="Date completed">
                    <input
                      type="date"
                      value={form.completed_at}
                      onChange={(e) => set("completed_at", e.target.value)}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("location") && (
                  <FormField label="Venue">
                    <input
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      maxLength={255}
                      placeholder="Barangay Covered Court"
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("organizer") && (
                  <FormField label="Organiser">
                    <input
                      value={form.organizer}
                      onChange={(e) => set("organizer", e.target.value)}
                      maxLength={150}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("participants") && (
                  <FormField label="Who took part" hint="Offices, groups or volunteers.">
                    <input
                      value={form.participants}
                      onChange={(e) => set("participants", e.target.value)}
                      maxLength={255}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("contact_info") && (
                  <FormField label="Who to contact" hint="A name or a number residents can reach.">
                    <input
                      value={form.contact_info}
                      onChange={(e) => set("contact_info", e.target.value)}
                      maxLength={150}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("registration_deadline") && (
                  <FormField label="Register until">
                    <input
                      type="date"
                      value={form.registration_deadline}
                      onChange={(e) => set("registration_deadline", e.target.value)}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("effective_at") && (
                  <FormField label="In effect from">
                    <input
                      type="date"
                      value={form.effective_at}
                      onChange={(e) => set("effective_at", e.target.value)}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("expires_at") && (
                  <FormField
                    label="Until"
                    hint="After this the advisory drops off the public page by itself."
                  >
                    <input
                      type="date"
                      value={form.expires_at}
                      onChange={(e) => set("expires_at", e.target.value)}
                      className={inputClasses}
                    />
                  </FormField>
                )}
                {uses("urgency") && (
                  <FormField label="Urgency">
                    <select
                      value={form.urgency}
                      onChange={(e) => set("urgency", e.target.value)}
                      className={inputClasses}
                    >
                      <option value="">—</option>
                      {URGENCIES.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </FormField>
                )}
              </div>
            </div>
          )}

          <FormField
            label={editId ? "Replace photo (optional)" : "Photo (optional)"}
            hint={
              editId
                ? "Leave this empty to keep the photo already on the post."
                : "Shown on the card and at the top of the post. JPG/PNG up to 5MB."
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
            {saving
              ? editId
                ? "Saving…"
                : "Posting…"
              : editId
                ? "Save changes"
                : form.status === "Published"
                  ? "Publish post"
                  : "Save draft"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
