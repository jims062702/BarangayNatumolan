import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle, FiXCircle } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { inputClasses } from "../../components/UI/FormField";
import logo from "../../assets/logo/logo.svg";

interface VerifyResult {
  valid: boolean;
  certificate_number?: string;
  certificate_type?: string;
  holder?: string;
  status?: string;
  issued_at?: string;
  message?: string;
}

/** Public QR / reference-number certificate verification. */
export default function VerifyCertificate() {
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const response = await api.get(`/verify/${encodeURIComponent(reference.trim())}`);
      setResult(response.data.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <FiArrowLeft aria-hidden="true" /> Back to website
        </Link>

        <div className="rounded-3xl bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <img src={logo} alt="Barangay Natumolan logo" className="mx-auto h-14 w-14" />
            <h1 className="mt-3 text-xl font-bold text-dark">Certificate Verification</h1>
            <p className="mt-1 text-sm text-gray-500">
              Enter the reference number printed on the certificate (or scanned
              from its QR code).
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClasses}
              placeholder="e.g. REF-ABC123"
              required
              aria-label="Reference number"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {loading ? "…" : "Verify"}
            </button>
          </form>

          {error && <p className="mt-4 text-sm font-medium text-danger">{error}</p>}

          {result && (
            <div
              className={`mt-6 rounded-2xl border p-5 ${
                result.valid
                  ? "border-success/30 bg-success/5"
                  : "border-danger/30 bg-danger/5"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.valid ? (
                  <FiCheckCircle className="h-6 w-6 text-success" aria-hidden="true" />
                ) : (
                  <FiXCircle className="h-6 w-6 text-danger" aria-hidden="true" />
                )}
                <p className={`font-bold ${result.valid ? "text-success" : "text-danger"}`}>
                  {result.valid ? "Certificate is authentic" : "Not verified"}
                </p>
              </div>
              {result.valid ? (
                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Certificate No.</dt>
                    <dd className="font-medium text-dark">{result.certificate_number}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Type</dt>
                    <dd className="font-medium text-dark">{result.certificate_type}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Issued to</dt>
                    <dd className="font-medium text-dark">{result.holder}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Status</dt>
                    <dd className="font-medium text-dark">{result.status}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  {result.message ?? "No certificate matches this reference number."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
