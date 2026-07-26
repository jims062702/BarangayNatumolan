import { useState, type ChangeEvent, type FormEvent } from "react";
import { FiSend } from "react-icons/fi";
import Button from "../Button/Button";
import { api, errorMessage } from "../../lib/api";

interface ContactFormState {
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

const initialForm: ContactFormState = {
  fullName: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
};

const inputClasses =
  "w-full rounded-xl border border-gray bg-white px-4 py-3 text-sm text-dark placeholder:text-gray-400 outline-none transition duration-300 focus:border-primary focus:ring-2 focus:ring-primary/25";

const labelClasses = "mb-1.5 block text-sm font-medium text-dark";

export default function ContactForm() {
  const [form, setForm] = useState<ContactFormState>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSubmitted(false);
    setError("");
  };

  // Delivers the message to the barangay Main Office staff in-system.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.post("/contact", {
        full_name: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        subject: form.subject,
        message: form.message,
      });
      setForm(initialForm);
      setSubmitted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={labelClasses}>
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            placeholder="Juan Dela Cruz"
            value={form.fullName}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClasses}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={labelClasses}>
            Phone Number <span className="font-normal text-gray-400">(Optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+63 900 000 0000"
            value={form.phone}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="subject" className={labelClasses}>
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            required
            placeholder="How can we help?"
            value={form.subject}
            onChange={handleChange}
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className={labelClasses}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          placeholder="Write your message here..."
          value={form.message}
          onChange={handleChange}
          className={`${inputClasses} resize-none`}
        />
      </div>

      {submitted && (
        <p
          role="status"
          className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success"
        >
          Thank you! Your message has been sent to the Barangay Main Office —
          they will get back to you through your email or phone.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={sending} className="w-full sm:w-auto">
        {sending ? "Sending…" : "Send Message"} <FiSend aria-hidden="true" />
      </Button>
    </form>
  );
}
