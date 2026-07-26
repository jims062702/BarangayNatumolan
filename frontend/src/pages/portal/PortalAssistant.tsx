import { useState, type FormEvent } from "react";
import { FiHelpCircle, FiSend } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import { inputClasses } from "../../components/UI/FormField";
import type { ServiceGuide } from "../../types";

interface AssistantReply {
  answer: string;
  matches: ServiceGuide[];
}

/** AI-assisted resident inquiry & service guide (Shared Core module 4). */
export default function PortalAssistant() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/assistant/inquiry", { message });
      setReply(response.data.data);
      setAsked(message);
      setMessage("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Service Guide Assistant"
        subtitle="Ask what you need — get the right office, requirements, fees, and schedules"
      />

      <Card>
        <form onSubmit={ask} className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClasses}
            placeholder='e.g. "How do I get a barangay clearance for a job?"'
            required
            aria-label="Your question"
          />
          <button
            type="submit"
            disabled={loading}
            aria-label="Ask"
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            <FiSend aria-hidden="true" /> {loading ? "…" : "Ask"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      </Card>

      {reply && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-primary/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">You asked</p>
            <p className="mt-1 text-sm text-dark">{asked}</p>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-dark">{reply.answer}</p>
          </div>

          {reply.matches.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reply.matches.map((guide) => (
                <div key={guide.id} className="rounded-2xl border border-gray bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <FiHelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                    <p className="text-sm font-bold text-dark">{guide.service_name}</p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-primary">{guide.office}</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">{guide.description}</p>
                  <dl className="mt-3 space-y-1 text-xs text-gray-500">
                    <div>
                      <dt className="inline font-semibold text-dark">Requirements: </dt>
                      <dd className="inline">{guide.requirements ?? "None"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-dark">Fees: </dt>
                      <dd className="inline">{guide.fees ?? "Free"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-dark">Schedule: </dt>
                      <dd className="inline">{guide.schedule ?? "Office hours"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
