import { useEffect, useState, type FormEvent } from "react";
import { FiPlus } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import StatusBadge from "../../components/UI/StatusBadge";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { ChildHealthRecord, MaternalRecord, Resident } from "../../types";

export default function MaternalChild() {
  const [maternal, setMaternal] = useState<MaternalRecord[]>([]);
  const [children, setChildren] = useState<ChildHealthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [maternalOpen, setMaternalOpen] = useState(false);
  const [mother, setMother] = useState<Resident | null>(null);
  const [regDate, setRegDate] = useState(new Date().toISOString().slice(0, 10));
  const [edd, setEdd] = useState("");
  const [visits, setVisits] = useState("0");
  const [risk, setRisk] = useState("");

  const [childOpen, setChildOpen] = useState(false);
  const [childRes, setChildRes] = useState<Resident | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [nutrition, setNutrition] = useState("Normal");

  /*
   * `silent` is for the background timer.
   *
   * A refresh nobody asked for must not blank the page somebody is
   * reading; a first load or a filter change should still say it is
   * working. Same fetch, and only the announcement differs.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get("/health/maternal-health"), api.get("/health/child-health")])
      .then(([m, c]) => {
        setMaternal(m.data.data.data ?? []);
        setChildren(c.data.data.data ?? []);
      })
      .finally(() => setLoading(false));
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
  usePulse("health", () => load(true));

  const saveMaternal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Save this maternal record?", confirmText: "Yes, save" }))) return;
    try {
      await api.post("/health/maternal-health", {
        mother_id: mother?.id,
        pregnancy_registration_date: regDate,
        expected_delivery_date: edd || undefined,
        prenatal_visits_count: Number(visits),
        risk_indicators: risk || undefined,
      });
      setMaternalOpen(false);
      setMother(null);
      toast("Maternal record saved.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const saveChild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(await confirmAction({ title: "Save this child health record?", confirmText: "Yes, save" }))) return;
    try {
      await api.post("/health/child-health", {
        child_id: childRes?.id,
        birth_date: birthDate,
        current_weight: weight || undefined,
        current_height: height || undefined,
        nutritional_status: nutrition,
      });
      setChildOpen(false);
      setChildRes(null);
      toast("Child health record saved.");
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div>
      <PageHeader title="Maternal & Child Health" subtitle="Prenatal registry and child growth / nutrition monitoring" />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Maternal / prenatal registry"
          action={
            <button type="button" onClick={() => setMaternalOpen(true)} className="cursor-pointer text-sm font-medium text-primary hover:underline">
              <FiPlus className="h-4 w-4" aria-hidden="true" /> Register
            </button>
          }
        >
          <DataTable
            columns={[
              {
                header: "Mother",
                render: (m: MaternalRecord) => (m.mother ? `${m.mother.first_name} ${m.mother.last_name}` : "—"),
              },
              {
                header: "EDD",
                render: (m: MaternalRecord) =>
                  m.expected_delivery_date ? new Date(m.expected_delivery_date).toLocaleDateString("en-PH") : "—",
              },
              { header: "Prenatal Visits", render: (m: MaternalRecord) => m.prenatal_visits_count },
              { header: "Status", render: (m: MaternalRecord) => <StatusBadge status={m.status} /> },
            ]}
            rows={maternal}
            rowKey={(m) => m.id}
            numbered
            total={maternal.length}
            searchable
            searchPlaceholder="Search by mother…"
            getSearchText={(m) => (m.mother ? `${m.mother.first_name} ${m.mother.last_name}` : "")}
            loading={loading}
            emptyMessage="No maternal records."
          />
        </Card>

        <Card
          title="Child health & nutrition"
          action={
            <button type="button" onClick={() => setChildOpen(true)} className="cursor-pointer text-sm font-medium text-primary hover:underline">
              <FiPlus className="h-4 w-4" aria-hidden="true" /> Record
            </button>
          }
        >
          <DataTable
            columns={[
              {
                header: "Child",
                render: (c: ChildHealthRecord) => (c.child ? `${c.child.first_name} ${c.child.last_name}` : "—"),
              },
              { header: "Weight", render: (c: ChildHealthRecord) => (c.current_weight ? `${c.current_weight} kg` : "—") },
              { header: "Height", render: (c: ChildHealthRecord) => (c.current_height ? `${c.current_height} cm` : "—") },
              { header: "Nutrition", render: (c: ChildHealthRecord) => c.nutritional_status ?? "—" },
            ]}
            rows={children}
            rowKey={(c) => c.id}
            numbered
            searchable
            searchPlaceholder="Search by child…"
            getSearchText={(c) => (c.child ? `${c.child.first_name} ${c.child.last_name}` : "")}
            loading={loading}
            emptyMessage="No child health records."
          />
        </Card>
      </div>

      <Modal open={maternalOpen} onClose={() => setMaternalOpen(false)} title="Register / update pregnancy">
        <form onSubmit={saveMaternal} className="space-y-4">
          <FormField label="Mother" required plain>
            <ResidentPicker value={mother} onChange={setMother} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Registration date" required>
              <input type="date" value={regDate} onChange={(e) => setRegDate(e.target.value)} required className={inputClasses} />
            </FormField>
            <FormField label="Expected delivery">
              <input type="date" value={edd} onChange={(e) => setEdd(e.target.value)} className={inputClasses} />
            </FormField>
          </div>
          <FormField label="Prenatal visits">
            <input type="number" min="0" value={visits} onChange={(e) => setVisits(e.target.value)} className={inputClasses} />
          </FormField>
          <FormField label="Risk indicators">
            <input value={risk} onChange={(e) => setRisk(e.target.value)} className={inputClasses} />
          </FormField>
          <button
            type="submit"
            disabled={!mother}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </Modal>

      <Modal open={childOpen} onClose={() => setChildOpen(false)} title="Record child health">
        <form onSubmit={saveChild} className="space-y-4">
          <FormField label="Child" required plain>
            <ResidentPicker value={childRes} onChange={setChildRes} />
          </FormField>
          <FormField label="Birth date" required>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className={inputClasses} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Weight (kg)">
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Height (cm)">
              <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className={inputClasses} />
            </FormField>
          </div>
          <FormField label="Nutritional status">
            <select value={nutrition} onChange={(e) => setNutrition(e.target.value)} className={inputClasses}>
              <option>Normal</option>
              <option>Underweight</option>
              <option>Severely Underweight</option>
              <option>Overweight</option>
              <option>Stunted</option>
            </select>
          </FormField>
          <button
            type="submit"
            disabled={!childRes}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}
