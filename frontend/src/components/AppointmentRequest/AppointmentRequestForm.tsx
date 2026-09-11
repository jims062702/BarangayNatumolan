import { useState, type FormEvent } from "react";
import { FiCalendar, FiCheckCircle } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import PhoneInput from "../UI/PhoneInput";

/**
 * Asking the barangay for a time, without an account.
 *
 * Everything here used to require a portal account, and a portal account
 * requires being on the register — so a contractor, a relative settling an
 * estate, anybody living elsewhere with business here had no way to arrange a
 * visit except turning up and hoping.
 *
 * Five things are asked and only four are required. An email address is asked
 * for and not insisted on: a phone number reaches everybody in this barangay
 * and an email does not, so demanding one turns people away at the door for
 * the convenience of the desk.
 */

const input =
  "w-full rounded-xl border border-gray bg-white px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";

/**
 * The soonest day worth offering: tomorrow at the earliest, and never a
 * weekend — the hall is shut and the office needs notice.
 *
 * Built from the LOCAL date rather than toISOString(), which converts to UTC
 * first and hands back yesterday for anybody east of Greenwich after 8am.
 */
function asLocalDate(day: Date): string {
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

function firstBookableDay(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() + 1);

  return asLocalDate(day);
}

function twoMonthsOut(): string {
  const day = new Date();
  day.setMonth(day.getMonth() + 2);

  return asLocalDate(day);
}

export default function AppointmentRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [purpose, setPurpose] = useState("");
  /*
   * Empty, both of them.
   *
   * A date already filled in is a date somebody submits without reading —
   * and the one the form happened to choose is almost never the one they
   * wanted. The bounds still guide: the picker will not offer today, a
   * weekend, or a day more than two months out.
   */
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");

    try {
      const response = await api.post("/appointment-requests", {
        guest_name: name.trim(),
        guest_email: email.trim() || undefined,
        /* Already +639XXXXXXXXX — PhoneInput emits the one shape. */
        guest_contact: contact,
        purpose: purpose.trim(),
        /* Read by the server as Manila wall-clock time and stored as UTC. */
        scheduled_datetime: date + " " + time + ":00",
      });

      setReference(response.data.data.appointment_number);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (reference) {
    return (
      <div className="text-center">
        <FiCheckCircle className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
        <h3 className="mt-4 text-lg font-bold text-dark">Your request is in</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Keep this reference:{" "}
          <span className="font-mono font-bold text-primary">{reference}</span>
        </p>
        {/*
          Said plainly, because the difference matters. Somebody who leaves
          this page believing they have an appointment, turns up, and finds
          they have not, was let down by this sentence.
        */}
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          The barangay will call you on the number you gave to confirm the day
          and time. Nothing is booked until they do.
        </p>
      </div>
    );
  }

  return (
    /*
      Three columns on a wide screen, one on a phone.
      
      Seven fields in a single column made a form tall enough to scroll past,
      which reads as a lot of work for what is five short answers. Laid across
      the width it is visibly short — and that is most of whether somebody
      starts filling it in.
    */
    <form onSubmit={submit}>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-dark">Request an appointment</h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          {/*
            Says who, so nobody has to guess which desk they are asking for.
            The form used to ask, which put the barangay's own organisation to
            somebody who does not work here.
          */}
          With the Barangay Secretary. You do not need an account — the
          barangay will call you to confirm.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {/*
        The order fills the rows.

        Purpose spans all three because it is the one answer worth room to
        write; everything else is a short one, so three to a row leaves no
        half-empty line for the eye to trip over.
      */}
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-dark">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={150}
            className={input}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-dark">Mobile number</span>
          {/*
            The same +63 box the staff forms use, rather than a bare field
            asking for a whole number. Ten digits is what somebody knows about
            their own phone; the country code is not a thing to retype.

            It emits +639XXXXXXXXX, which is the shape the server matches.
          */}
          <PhoneInput value={contact} onChange={setContact} required />
          <span className="mt-1 block text-xs text-gray-500">
            This is how the barangay will reach you.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-dark">
            Email <span className="font-normal text-gray-400">— optional</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={150}
            className={input}
          />
        </label>

        <label className="block lg:col-span-3">
          <span className="mb-1.5 block text-sm font-medium text-dark">What is it about</span>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
            rows={2}
            maxLength={300}
            placeholder="A sentence is enough — it helps the office prepare."
            className={input}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-dark">Preferred day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            /* The bounds do the guiding now that nothing is pre-filled. */
            min={firstBookableDay()}
            max={twoMonthsOut()}
            className={input}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-dark">Preferred time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            min="08:00"
            max="16:30"
            step={1800}
            className={input}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Monday to Friday, 8:00 AM to 5:00 PM.
          </span>
        </label>

        {/* Aligned to the bottom of the row it shares, so it sits level with
            the box beside it rather than floating at the top of the cell. */}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={sending}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiCalendar className="h-4 w-4" aria-hidden="true" />
            {sending ? "Sending…" : "Request this time"}
          </button>
        </div>
      </div>
    </form>
  );
}
