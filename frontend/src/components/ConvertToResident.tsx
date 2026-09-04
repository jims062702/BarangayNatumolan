import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiHome } from "react-icons/fi";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { showServerFieldErrors } from "../lib/formErrors";
import { confirmAction } from "../lib/confirm";
import { toast } from "../lib/toast";
import Card from "./UI/Card";
import Modal from "./UI/Modal";
import NewHouseholdModal from "./NewHouseholdModal";
import ResidentFormFields, {
  RESIDENT_FORM_INITIAL,
  buildResidentPayload,
  type ResidentForm,
} from "./ResidentFormFields";
import type { Household, Resident } from "../types";

/**
 * "They have moved in" — turns a non-resident into a bona fide resident.
 *
 * A conversion rather than a fresh registration, because everything already
 * attached to them comes with them: their family links, their marriages, the
 * lot. Registering them again would leave a duplicate behind and split the
 * family in two — the exact mess the merge tool exists to clean up.
 *
 * Now that they live here, the full record is required, and they get what
 * every resident gets: a purok, sector tags, and a portal account.
 */

interface Props {
  resident: Resident;
  onConverted: () => void;
}

export default function ConvertToResident({ resident, onConverted }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ResidentForm>(RESIDENT_FORM_INITIAL);
  const [manualSectors, setManualSectors] = useState<string[]>([]);
  const [autoLength, setAutoLength] = useState(false);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [hhOpen, setHhOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Carry over what the short record already holds, so nothing is retyped.
  useEffect(() => {
    if (!open) return;
    setError("");
    setManualSectors([]);
    setAutoLength(false);
    setSelectedHousehold(null);
    setForm({
      ...RESIDENT_FORM_INITIAL,
      first_name: resident.first_name ?? "",
      middle_name: resident.middle_name ?? "",
      last_name: resident.last_name ?? "",
      suffix: resident.suffix ?? "",
      contact_number: resident.contact_number ?? "",
      email: resident.email ?? "",
      gender: resident.gender ?? "",
      birthdate: resident.birthdate ? resident.birthdate.slice(0, 10) : "",
      civil_status: resident.civil_status ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resident.id]);

  if (resident.record_type !== "Non-resident") return null;

  const patch = (values: Partial<ResidentForm>) => setForm((prev) => ({ ...prev, ...values }));

  const selectHousehold = (household: Household | null) => {
    setSelectedHousehold(household);
    setForm((prev) => ({
      ...prev,
      household_id: household ? String(household.id) : "",
      zone_purok: household?.zone_purok || prev.zone_purok,
    }));
  };

  const toggleSector = (sector: string) =>
    setManualSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !(await confirmAction({
        title: `Register ${resident.first_name} ${resident.last_name} as a resident?`,
        text: "They will be counted in the population and given a portal account. Their family links are kept.",
        confirmText: "Yes, they live here now",
      }))
    )
      return;

    setSaving(true);
    setError("");
    try {
      const payload = buildResidentPayload(form, manualSectors, autoLength);
      const response = await api.post(`/residents/${resident.id}/convert-to-resident`, payload);
      const account = response.data.data?.portal_account;
      // The password is shown once, so the office can tell them at the counter.
      toast(
        account?.created && account?.password
          ? `${response.data.message} Temporary password: ${account.password}`
          : response.data.message
      );
      onConverted();
      setOpen(false);
    } catch (err) {
      const shownInline = showServerFieldErrors(formRef.current, fieldErrors(err));
      setError(shownInline ? "" : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card title="Not a barangay resident">
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-secondary/70 px-4 py-3 text-sm leading-relaxed text-gray-600">
          <FiHome aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            This record exists so a family could be recorded — it is{" "}
            <strong>not counted in the population</strong> and has{" "}
            <strong>no portal account</strong>. Only a name, a number and an address are held.
            {resident.address && (
              <>
                {" "}
                Address on file: <strong>{resident.address}</strong>.
              </>
            )}
          </span>
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          They have moved in — register as a resident
        </button>

        <p className="mt-2 text-xs text-gray-400">
          Converts this record rather than making a new one, so their family links, marriages and
          history all come with them.
        </p>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Register ${resident.first_name} ${resident.last_name} as a resident`}
        size="xl"
      >
        {error && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">{error}</p>
        )}

        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2.5 text-xs leading-relaxed text-dark">
          Now that they live here, the <strong>full record</strong> is needed — the same as any
          resident. What is already on file has been carried over. Give an email address and their
          portal account is created and emailed to them.
        </p>

        <form
          ref={formRef}
          onSubmit={submit}
          className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ResidentFormFields
            form={form}
            onChange={patch}
            manualSectors={manualSectors}
            onToggleSector={toggleSector}
            autoLength={autoLength}
            onAutoLengthChange={setAutoLength}
            selectedHousehold={selectedHousehold}
            onSelectHousehold={selectHousehold}
            onAddNewHousehold={() => setHhOpen(true)}
          />

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Register as a barangay resident"}
            </button>
          </div>
        </form>
      </Modal>

      <NewHouseholdModal
        open={hhOpen}
        onClose={() => setHhOpen(false)}
        onCreated={selectHousehold}
        defaultPurok={form.zone_purok}
      />
    </>
  );
}
