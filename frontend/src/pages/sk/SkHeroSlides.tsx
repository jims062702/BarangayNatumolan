import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { HeroSlide } from "../../types";

export default function SkHeroSlides() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null); // null = add mode
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/sk/hero-slides").then((r) => setSlides(r.data.data ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Live updates without a manual refresh.
  useAutoRefresh(load, REFRESH.staff);

  const openAdd = () => {
    setEditId(null);
    setTitle("");
    setSubtitle("");
    setCurrentImage(null);
    setFile(null);
    setOpen(true);
  };

  const openEdit = (slide: HeroSlide) => {
    setEditId(slide.id);
    setTitle(slide.title ?? "");
    setSubtitle(slide.subtitle ?? "");
    setCurrentImage(slide.image_url ?? null);
    setFile(null);
    setOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editId && !file) return; // a new slide needs an image
    setSaving(true);
    setFeedback("");
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("subtitle", subtitle);
      if (file) form.append("image", file);

      if (editId) {
        form.append("_method", "PUT");
        await api.post(`/sk/hero-slides/${editId}`, form, { headers: { "Content-Type": "multipart/form-data" } });
        setFeedback("Home picture updated.");
      } else {
        form.append("sort_order", String(slides.length));
        await api.post("/sk/hero-slides", form, { headers: { "Content-Type": "multipart/form-data" } });
        setFeedback("Home picture added — it now shows on the public site.");
      }
      setOpen(false);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const ids = slides.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.post("/sk/hero-slides/reorder", { ids });
    load();
  };

  const toggleActive = async (slide: HeroSlide) => {
    const form = new FormData();
    form.append("_method", "PUT");
    form.append("is_active", slide.is_active ? "0" : "1");
    await api.post(`/sk/hero-slides/${slide.id}`, form);
    load();
  };

  const remove = async (slide: HeroSlide) => {
    if (!window.confirm("Delete this home picture?")) return;
    await api.delete(`/sk/hero-slides/${slide.id}`);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Home Section Pictures"
        subtitle="The carousel photos shown at the top of the public landing page"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Add picture
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      {loading && slides.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
      ) : slides.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-gray-400">
            No home pictures yet — the public site is showing the default images.
            Add pictures to replace them.
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500">
            Pictures show in this order — the <strong>first</strong> one appears first on the site.
            Use the arrows to change the order.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((slide, index) => (
              <div key={slide.id} className="overflow-hidden rounded-2xl border border-gray bg-white shadow-sm">
                <div className="relative h-44 bg-secondary">
                  {slide.image_url && (
                    <img src={slide.image_url} alt={slide.title ?? "Home picture"} className="h-full w-full object-cover" />
                  )}
                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                      Shows first
                    </span>
                  )}
                  {!slide.is_active && (
                    <span className="absolute right-2 top-2 rounded-full bg-dark/70 px-2 py-0.5 text-xs font-semibold text-white">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-dark">{slide.title || "Untitled"}</p>
                  <p className="truncate text-xs text-gray-500">{slide.subtitle || "—"}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      title="Move earlier"
                      className="cursor-pointer rounded-full border border-gray px-2.5 py-1 text-xs font-semibold text-dark hover:border-primary hover:text-primary disabled:opacity-30"
                    >
                      ↑ Earlier
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === slides.length - 1}
                      title="Move later"
                      className="cursor-pointer rounded-full border border-gray px-2.5 py-1 text-xs font-semibold text-dark hover:border-primary hover:text-primary disabled:opacity-30"
                    >
                      ↓ Later
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(slide)}
                      className="cursor-pointer rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(slide)}
                      className="cursor-pointer rounded-full border border-gray px-3 py-1 text-xs font-semibold text-dark hover:border-primary hover:text-primary"
                    >
                      {slide.is_active ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(slide)}
                      className="cursor-pointer rounded-full border border-danger/40 px-3 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Edit Home Picture" : "Add Home Picture"}>
        <form onSubmit={save} className="space-y-4">
          {editId && currentImage && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-dark">Current picture</p>
              <img src={currentImage} alt="Current" className="h-40 w-full rounded-xl object-cover" />
            </div>
          )}
          <FormField
            label={editId ? "Replace picture (optional)" : "Picture"}
            required={!editId}
            hint="JPG/PNG, up to 5MB. Wide/landscape looks best."
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required={!editId}
              className="block w-full text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
            />
          </FormField>
          <FormField label="Heading (optional)">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClasses} placeholder="Welcome to Barangay Natumolan" />
          </FormField>
          <FormField label="Subtitle (optional)">
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputClasses} />
          </FormField>
          <button
            type="submit"
            disabled={saving || (!editId && !file)}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : editId ? "Save changes" : "Add picture"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
