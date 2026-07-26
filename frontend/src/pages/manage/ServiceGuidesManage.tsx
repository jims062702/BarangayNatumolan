import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import type { ServiceGuide } from "../../types";

const OFFICES = ["Main Office", "VAWC", "Lupon", "Population", "Health Station", "CDC"];

export default function ServiceGuidesManage() {
  const [rows, setRows] = useState<ServiceGuide[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [open, setOpen] = useState(false);
  const [office, setOffice] = useState(OFFICES[0]);
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [fees, setFees] = useState("");
  const [schedule, setSchedule] = useState("");
  const [keywords, setKeywords] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/manage/service-guides", { params: { page } })
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

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    try {
      await api.post("/manage/service-guides", {
        office,
        service_name: serviceName,
        description,
        requirements: requirements || undefined,
        fees: fees || undefined,
        schedule: schedule || undefined,
        keywords: keywords || undefined,
        is_active: true,
      });
      setOpen(false);
      setServiceName("");
      setDescription("");
      setRequirements("");
      setFeedback("Service guide added — the assistant will use it immediately.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  const remove = async (guide: ServiceGuide) => {
    if (!window.confirm(`Delete "${guide.service_name}"?`)) return;
    try {
      await api.delete(`/manage/service-guides/${guide.id}`);
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Service Guides (Assistant Knowledge Base)"
        subtitle="Entries that power the AI-assisted resident inquiry — requirements, fees, and schedules"
        actions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + New service guide
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <Card>
        <DataTable
          columns={[
            { header: "Service", render: (g: ServiceGuide) => <span className="font-medium text-dark">{g.service_name}</span> },
            { header: "Office", render: (g: ServiceGuide) => g.office },
            { header: "Fees", render: (g: ServiceGuide) => g.fees ?? "Free" },
            { header: "Schedule", render: (g: ServiceGuide) => g.schedule ?? "—" },
            {
              header: "",
              render: (g: ServiceGuide) => (
                <button
                  type="button"
                  onClick={() => remove(g)}
                  className="cursor-pointer text-xs font-semibold text-danger hover:underline"
                >
                  Delete
                </button>
              ),
            },
          ]}
          rows={rows}
          rowKey={(g) => g.id}
          searchable
          searchPlaceholder="Search services…"
          getSearchText={(g) => `${g.service_name} ${g.office}`}
          filters={[{ label: "Office", getValue: (g) => g.office }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New Service Guide" wide>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Office" required>
            <select value={office} onChange={(e) => setOffice(e.target.value)} className={inputClasses}>
              {OFFICES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Service name" required>
            <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} required className={inputClasses} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Description" required>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} className={`${inputClasses} resize-none`} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Requirements">
              <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={2} className={`${inputClasses} resize-none`} />
            </FormField>
          </div>
          <FormField label="Fees">
            <input value={fees} onChange={(e) => setFees(e.target.value)} className={inputClasses} placeholder="₱50.00 or Free" />
          </FormField>
          <FormField label="Schedule">
            <input value={schedule} onChange={(e) => setSchedule(e.target.value)} className={inputClasses} placeholder="Mon–Fri, 8AM–5PM" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Search keywords" hint="Comma-separated terms residents might use">
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputClasses} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
              Save guide
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
