import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheckCircle, FiSearch, FiUserPlus, FiXCircle } from "react-icons/fi";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useAuth } from "../../contexts/AuthContext";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import SearchInput from "../../components/UI/SearchInput";

/** The lookup payload — enough to confirm residency, nothing more. */
interface VerificationResult {
  id: number;
  resident_number: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  zone_purok?: string | null;
  /** Null for a non-resident: they have no residency here to state. */
  residency_status?: string | null;
  /** "Resident" or "Non-resident" — whether they are a constituent at all. */
  record_type?: string | null;
  is_non_resident?: boolean;
  /** Where a non-resident actually lives. */
  address?: string | null;
  life_status?: string | null;
  date_of_death?: string | null;
  is_active: boolean;
  /** Registered residents may still have no login issued to them. */
  has_portal_account: boolean;
  portal_account_active?: boolean | null;
  portal_email?: string | null;
}

const fullName = (r: VerificationResult) =>
  [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(" ");

/**
 * What the counter needs to tell apart, in the order that matters.
 *
 * The first two outrank every other consideration, because they are about
 * whether this person may be served AT ALL:
 *
 *  - a NON-RESIDENT is on the register so a family could be recorded whole.
 *    They are somebody's mother in Riyadh. They are not a constituent, and a
 *    barangay certificate is not theirs to receive. Before this, the card
 *    said "Registered · no portal account" beside them and printed
 *    "Residency: Permanent" — a NOT NULL column default, not a fact — and a
 *    clerk reading it had no way to know.
 *  - a DECEASED resident must never be served either, and their record looks
 *    perfectly ordinary otherwise.
 *
 * Only then do the ordinary three apply: holding a working login, registered
 * with no login (still entitled to service), or an inactive record.
 */
function statusOf(r: VerificationResult) {
  if (r.is_non_resident) {
    return {
      tone: "border-dark/20 bg-dark/5",
      pill: "bg-dark/10 text-dark",
      icon: FiXCircle,
      label: "Non-resident · not a constituent",
    };
  }
  if (r.life_status === "Deceased") {
    return {
      tone: "border-danger/30 bg-danger/5",
      pill: "bg-danger/10 text-danger",
      icon: FiXCircle,
      label: "Deceased",
    };
  }
  if (!r.is_active) {
    return {
      tone: "border-danger/30 bg-danger/5",
      pill: "bg-danger/10 text-danger",
      icon: FiXCircle,
      label: "Inactive record",
    };
  }
  if (!r.has_portal_account) {
    return {
      tone: "border-warning/30 bg-warning/5",
      pill: "bg-warning/10 text-warning",
      icon: FiUserPlus,
      label: "Registered · no portal account",
    };
  }
  if (r.portal_account_active === false) {
    return {
      tone: "border-warning/30 bg-warning/5",
      pill: "bg-warning/10 text-warning",
      icon: FiUserPlus,
      label: "Registered · portal account disabled",
    };
  }
  return {
    tone: "border-success/30 bg-success/5",
    pill: "bg-success/10 text-success",
    icon: FiCheckCircle,
    label: "Registered · portal account active",
  };
}

export default function RecordsVerification() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VerificationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Guards against a slow earlier response overwriting a newer one.
  const latest = useRef(0);

  // Search as the clerk types — one letter is enough. Debounced so a fast
  // typist sends one request, not one per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const seq = ++latest.current;
    const timer = setTimeout(() => {
      api
        .get("/population/verify-resident", { params: { q: term } })
        .then((response) => {
          if (seq !== latest.current) return; // a newer search already ran
          setResults(response.data.data ?? []);
        })
        .catch((err) => {
          if (seq !== latest.current) return;
          setResults(null);
          toast(errorMessage(err), "error");
        })
        .finally(() => {
          if (seq === latest.current) setLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Only people who could actually be issued one.
  const noAccount = (results ?? []).filter(
    (r) => r.is_active && !r.is_non_resident && r.life_status !== "Deceased" && !r.has_portal_account
  ).length;
  const nonResidents = (results ?? []).filter((r) => r.is_non_resident).length;

  /*
   * The full registry record belongs to the Population Office. The front desk
   * verifies a person here but cannot open the register, so the link is only
   * offered to accounts that can actually follow it — an offer that 403s is
   * worse than no offer at all.
   */
  const canOpenRegistry = user?.office === "Population" || user?.role === "Admin";

  return (
    <div>
      <PageHeader
        title="Records Verification"
        subtitle="Confirm a person is a registered resident, and whether a portal account has been issued"
      />

      <div className="mb-4 rounded-2xl border border-gray bg-secondary px-4 py-3 text-xs text-gray-500">
        Being in the registry and holding a portal account are separate things.
        A resident with <strong>no portal account</strong> is still a registered
        resident and may be served at the counter — they simply have no online
        login yet.
      </div>

      <Card>
        <div className="relative">
          <FiSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Start typing a name or resident number…"
            label="Search the registry"
            autoFocus
          />
          {loading && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              Searching…
            </span>
          )}
          {!loading && results !== null && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {results.length} match{results.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Results appear as you type. You can enter a full name — “Juan Dela
          Cruz” — or just part of one.
        </p>

        {nonResidents > 0 && (
          <p className="mt-4 rounded-xl bg-dark/5 px-4 py-2.5 text-sm leading-relaxed text-dark">
            {nonResidents} of these {nonResidents === 1 ? "match is" : "matches are"}{" "}
            <strong>not residents of Barangay Natumolan</strong> — they are relatives on the
            register who live elsewhere, and cannot be issued a barangay certificate.
          </p>
        )}

        {noAccount > 0 && (
          <p className="mt-4 rounded-xl bg-warning/10 px-4 py-2.5 text-sm text-dark">
            {noAccount} of these registered resident(s) have{" "}
            <strong>no portal account</strong> yet.{" "}
            {canOpenRegistry ? (
              <>
                Issue one from{" "}
                <Link
                  to="/population/accounts"
                  className="font-semibold text-primary hover:underline"
                >
                  Portal Accounts
                </Link>
                .
              </>
            ) : (
              // Only the Population Office issues logins, so the front desk is
              // told where to send the person rather than shown a dead link.
              <>Serve them at the counter as usual; only the Population Office issues logins.</>
            )}
          </p>
        )}

        {results !== null && results.length === 0 && !loading && (
          <div className="mt-6 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-6 text-center">
            <FiXCircle className="mx-auto h-8 w-8 text-danger" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-dark">No matching record</p>
            <p className="mt-1 text-xs text-gray-500">
              No registered resident matches “{query}”. Refer the person to the
              Population Office before issuing any certificate.
            </p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <ul className="mt-6 space-y-3">
            {results.map((r) => {
              const status = statusOf(r);
              const StatusIcon = status.icon;
              return (
                <li key={r.id} className={`rounded-2xl border px-4 py-3 ${status.tone}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-dark">{fullName(r)}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-500">
                        {r.resident_number}
                      </p>
                    </div>
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.pill}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {status.label}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                    {/*
                      A non-resident has no purok and no residency status, so
                      the two columns that would print an em dash and a
                      database default are replaced by the one fact about them
                      that is true and useful: where they actually are.
                    */}
                    {r.is_non_resident ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-gray-400">Living in</dt>
                        <dd className="text-dark">{r.address || "Not recorded"}</dd>
                      </div>
                    ) : (
                      <>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Zone / Purok
                          </dt>
                          <dd className="text-dark">{r.zone_purok ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-gray-400">
                            Residency
                          </dt>
                          <dd className="text-dark">{r.residency_status ?? "—"}</dd>
                        </div>
                      </>
                    )}
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-gray-400">Portal login</dt>
                      <dd className="truncate text-dark">
                        {r.has_portal_account ? (r.portal_email ?? "Issued") : "None issued"}
                      </dd>
                    </div>
                    <div className="sm:text-right">
                      {canOpenRegistry ? (
                        <Link
                          to={`/residents/${r.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Open full record
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Full record held by the Population Office
                        </span>
                      )}
                    </div>
                  </dl>

                  {r.is_non_resident && (
                    <p className="mt-3 rounded-xl bg-dark/5 px-3 py-2 text-xs leading-relaxed text-dark">
                      <strong>Not a resident of Barangay Natumolan.</strong> This record exists so a
                      family could be recorded whole &mdash; they are a relative of someone here who
                      lives elsewhere. They are not counted in the population and a barangay
                      certificate is not theirs to receive. If they have moved in, the Population
                      Office must convert the record first; their family links come with them.
                    </p>
                  )}
                  {r.life_status === "Deceased" && (
                    <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs leading-relaxed text-dark">
                      <strong>This resident has died</strong>
                      {r.date_of_death ? ` (recorded ${r.date_of_death})` : ""}. Nothing may be
                      issued in their name. A surviving relative asking on their behalf needs their
                      own record.
                    </p>
                  )}
                  {!r.is_non_resident && r.life_status !== "Deceased" && !r.is_active && (
                    <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-dark">
                      This registry record is inactive. Confirm with the
                      Population Office before issuing a certificate.
                    </p>
                  )}
                  {!r.is_non_resident && r.life_status !== "Deceased" && r.is_active
                    && !r.has_portal_account && (
                    <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs text-dark">
                      Registered resident with no online account — serve the
                      walk-in normally. Issue a portal account only if they want
                      to file requests online.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
