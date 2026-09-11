import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { personName } from "../../lib/names";
import { ageFromBirthdate } from "../../components/ResidentFormFields";
import { FiEdit2 } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { confirmAction } from "../../lib/confirm";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import { usePulse } from "../../hooks/usePulse";
import Card from "../../components/UI/Card";
import DataTable from "../../components/UI/DataTable";
import Modal from "../../components/UI/Modal";
import PageHeader from "../../components/UI/PageHeader";
import FormField, { inputClasses } from "../../components/UI/FormField";
import ResidentPicker from "../../components/ResidentPicker";
import type { Household, Resident } from "../../types";


// @frezieh palambing ko dol

export default function HouseholdList() {
  const [rows, setRows] = useState<Household[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // So the footer can say WHICH rows are on screen, not only the page.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // One modal for both add and edit — editingId null = adding.
  const [modalOpen, setModalOpen] = useState(false);
  /** The household whose members are being read, if any. */
  const [viewing, setViewing] = useState<Household | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [number, setNumber] = useState("");
  const [zone, setZone] = useState("Purok 1");
  const [address, setAddress] = useState("");
  const [houseType, setHouseType] = useState("Concrete");
  const [head, setHead] = useState<Resident | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * `silent` is for the background timer.
   *
   * A refresh nobody asked for must not blank the page somebody is
   * reading; a first load or a filter change should still say it is
   * working. Same fetch, and only the announcement differs.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api
      .get("/population/households", { params: { page } })
      .then((r) => {
        setRows(r.data.data.data ?? []);
        setLastPage(r.data.data.last_page ?? 1);
        setTotal(r.data.data.total ?? 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Live updates without a manual refresh.
  useAutoRefresh(() => load(true), REFRESH.staff);

  /*
   * Somebody else's change, about a second after they make it.
   *
   * The timer above stays as a backstop: if the pulse cannot be
   * reached the page is a few seconds stale rather than frozen.
   */
  usePulse("households", () => load(true));


  const openEdit = (h: Household) => {
    setEditingId(h.id);
    setNumber(h.household_number ?? "");
    setZone(h.zone_purok ?? "Purok 1");
    setAddress(h.street_address ?? "");
    setHouseType(h.house_type ?? "Concrete");
    setHead(h.head ?? null);
    setModalOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const editing = editingId !== null;
    if (
      !(await confirmAction({
        title: editing ? "Save changes to this household?" : "Add this household?",
        confirmText: editing ? "Yes, save" : "Yes, add",
      }))
    )
      return;
    setSaving(true);
    const payload = {
      household_number: number,
      zone_purok: zone,
      street_address: address,
      house_type: houseType,
      household_head_id: head?.id ?? null,
    };
    try {
      if (editing) {
        await api.put(`/population/households/${editingId}`, payload);
        toast("Household updated.");
      } else {
        await api.post("/population/households", payload);
        toast("Household registered.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Household Registry"
        subtitle="Shared population registry — the Main Office verifies records against this list"
      />

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
              /*
                A count that opens.

                Every name inline made each row three lines tall and pushed
                the address into a column an inch wide — a registry of two
                hundred households became unscannable to answer a question
                asked of one. So the number stays in the table and the names
                are one click away.
              */
              header: "Members",
              render: (h: Household) => {
                const count = (h.residents ?? []).length;

                if (count === 0) {
                  return <span className="text-gray-400">Nobody yet</span>;
                }

                return (
                  <button
                    type="button"
                    onClick={() => setViewing(h)}
                    className="cursor-pointer rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    {count} {count === 1 ? "person" : "people"}
                  </button>
                );
              },
            },
            {
              header: "",
              render: (h: Household) => (
                <button
                  type="button"
                  onClick={() => openEdit(h)}
                  title="Edit household"
                  aria-label="Edit household"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
                >
                  <FiEdit2 className="h-3.5 w-3.5" /> Edit
                </button>
              ),
            },
          ]}
          rows={rows}
          rowKey={(h) => h.id}
          numbered
          total={total}
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

      {/*
        Who lives here.

        The head is first and said to be the head, because "who owns this
        house" is the question this registry is opened for. Everybody else
        follows in the order the register holds them.
      */}
      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.household_number} — who lives here` : ""}
      >
        {viewing && (
          <div>
            <p className="mb-4 text-xs leading-relaxed text-gray-500">
              {[viewing.street_address, viewing.zone_purok].filter(Boolean).join(" · ")
                || "No address recorded"}
            </p>

            {/*
              A name on its own answers nothing. Two Juan Dela Cruzes in one
              household are the same row twice until something tells them
              apart, and "who is the child here" is the question this list is
              opened for — so sex, age and what they are to the head travel
              with the name.
            */}
            <ul className="space-y-2">
              {[...(viewing.residents ?? [])]
                .sort((a, b) => {
                  // The head first, then the oldest down — a household reads
                  // the way it is spoken about.
                  if (a.id === viewing.head?.id) return -1;
                  if (b.id === viewing.head?.id) return 1;
                  return String(a.birthdate ?? "").localeCompare(String(b.birthdate ?? ""));
                })
                .map((person) => {
                  const age = ageFromBirthdate(String(person.birthdate ?? ""));

                  return (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/residents/${person.id}`}
                          className="block text-sm font-semibold text-primary hover:underline"
                        >
                          {personName(person)}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {[
                            person.resident_number,
                            person.gender,
                            age !== null ? `${age} years old` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      {person.relation_to_head && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            person.relation_to_head === "Head"
                              ? "bg-primary text-white"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {person.relation_to_head}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>

            {/*
              A head who is not among the members is somebody who moved out
              without the register being told — or who is recorded as heading
              two houses at once. Saying so is more use than quietly listing
              one person fewer.
            */}
            {viewing.head
              && !(viewing.residents ?? []).some((r) => r.id === viewing.head?.id) && (
              <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs leading-relaxed text-amber-700">
                <strong>{personName(viewing.head)}</strong> is recorded as the head of this
                household but is not living in it. Either they have moved and the register was
                not told, or the head needs setting again.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Household" : "Register Household"}>
        <form onSubmit={save} className="space-y-4">
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
          <FormField label="Household head (owner)" hint="Search a resident — they become the identified owner of this household" plain>
            <ResidentPicker value={head} onChange={setHead} />
          </FormField>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Register"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
