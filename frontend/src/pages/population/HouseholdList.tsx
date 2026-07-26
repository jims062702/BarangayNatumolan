import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Household, Resident } from "../../types";

export default function HouseholdList() {
  const [rows, setRows] = useState<Household[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [zone, setZone] = useState("Purok 1");
  const [address, setAddress] = useState("");
  const [houseType, setHouseType] = useState("Concrete");
  const [head, setHead] = useState<Resident | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get("/population/households", { params: { page } })
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
    if (!(await confirmAction({ title: "Add this household?", confirmText: "Yes, add" }))) return;
    setFeedback("");
    try {
      await api.post("/population/households", {
        household_number: number,
        zone_purok: zone,
        street_address: address,
        house_type: houseType,
        household_head_id: head?.id,
      });
      setCreateOpen(false);
      setNumber("");
      setAddress("");
      setHead(null);
      setFeedback("Household registered.");
      load();
    } catch (err) {
      setFeedback(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Household Registry"
        subtitle="Shared population registry — the Main Office verifies records against this list"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            + Register household
          </button>
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary">{feedback}</p>
      )}

      <Card>
        <DataTable
          columns={[
            {
              header: "Household #",
              render: (h: Household) => <span className="font-medium text-dark">{h.household_number}</span>,
            },
            { header: "Purok", render: (h: Household) => h.zone_purok ?? "—" },
            { header: "Address", render: (h: Household) => h.street_address ?? "—" },
            {
              header: "Owner / Head",
              render: (h: Household) =>
                h.head ? (
                  <span className="font-medium text-dark">
                    {h.head.first_name} {h.head.last_name}
                  </span>
                ) : (
                  <span className="text-gray-400">No owner set</span>
                ),
            },
            {
              header: "Members",
              render: (h: Household) => (h.residents ?? []).length,
            },
          ]}
          rows={rows}
          rowKey={(h) => h.id}
          searchable
          searchPlaceholder="Search by household #, owner, or address…"
          getSearchText={(h) =>
            `${h.household_number} ${h.zone_purok ?? ""} ${h.street_address ?? ""} ${
              h.head ? `${h.head.first_name} ${h.head.last_name}` : ""
            }`
          }
          filters={[{ label: "Purok", getValue: (h) => h.zone_purok ?? "" }]}
          loading={loading}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Register Household">
        <form onSubmit={create} className="space-y-4">
          <FormField label="Household number" required>
            <input value={number} onChange={(e) => setNumber(e.target.value)} required className={inputClasses} placeholder="HH-2026-0009" />
          </FormField>
          <FormField label="Zone / Purok" required>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputClasses}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>Purok {n}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Street address" required>
            <input value={address} onChange={(e) => setAddress(e.target.value)} required className={inputClasses} />
          </FormField>
          <FormField label="House type">
            <select value={houseType} onChange={(e) => setHouseType(e.target.value)} className={inputClasses}>
              <option>Concrete</option>
              <option>Semi-concrete</option>
              <option>Light materials</option>
            </select>
          </FormField>
          <FormField label="Household head (owner)" hint="Search a resident — they become the identified owner of this household">
            <ResidentPicker value={head} onChange={setHead} />
          </FormField>
          <button type="submit" className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Register
          </button>
        </form>
      </Modal>
    </div>
  );
}
