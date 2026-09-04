import { useEffect, useState } from "react";
import { FiBookOpen, FiCalendar, FiFileText, FiShield } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import PageHeader from "../../components/UI/PageHeader";
import StatusBadge from "../../components/UI/StatusBadge";
import type { PortalBlotter, PortalKpCase } from "../../types/blotter";

/**
 * The resident's own cases — what they filed, and what was filed on them.
 *
 * Two things only: Katarungang Pambarangay cases and blotter entries. VAWC is
 * not here and must never be. The person a survivor is escaping usually lives
 * in the same house and often uses the same phone, and a line reading
 * "VAWC case — Active" on a page anybody in that house can open is how
 * somebody gets hurt. Those records stay at the desk, in person.
 *
 * What IS shown is deliberately partial: the schedule they have to keep, the
 * stage the case has reached, and who is on the other side — never the
 * narrative, and never anybody's address. Telling somebody who complained
 * about them is fair; telling them where to find that person is not.
 */

const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;

export default function PortalCases() {
  const [kp, setKp] = useState<PortalKpCase[]>([]);
  const [blotters, setBlotters] = useState<PortalBlotter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api
      .get("/portal/cases")
      .then((r) => {
        setKp(r.data.data.kp_cases ?? []);
        setBlotters(r.data.data.blotters ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useAutoRefresh(load, REFRESH.portal);

  const nothing = !loading && kp.length === 0 && blotters.length === 0;

  return (
    <div>
      <PageHeader
        title="My cases"
        subtitle="Katarungang Pambarangay cases and blotter entries you are part of"
      />

      {loading ? (
        <Card>
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        </Card>
      ) : nothing ? (
        <Card>
          <div className="py-10 text-center">
            <FiShield className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-medium text-dark">Nothing on record.</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-400">
              Cases you file at the barangay hall, and incidents where you are named, appear here
              so you can follow them without going back to ask.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {kp.length > 0 && (
            <Card title="Katarungang Pambarangay">
              <div className="space-y-3">
                {kp.map((c) => (
                  <div key={c.case_number} className="rounded-2xl border border-gray p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-dark">{c.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                          {c.case_number}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        {/* Which side they are on decides how the rest reads. */}
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-dark">
                          You are the {c.my_role.toLowerCase()}
                        </span>
                        <StatusBadge status={c.stage} />
                      </span>
                    </div>

                    <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-gray-400">Other party</dt>
                        <dd className="font-medium text-dark">{c.other_party || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Filed</dt>
                        <dd className="text-dark">{date(c.date_filed) ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Incident</dt>
                        <dd className="text-dark">
                          {date(c.occurred_on) ?? "—"}
                          {c.place ? ` · ${c.place}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Hearings held</dt>
                        <dd className="text-dark">{c.hearings_held}</dd>
                      </div>
                    </dl>

                    {/*
                      The one thing they must not miss. Failing to appear has
                      consequences under the KP rules, so it is given its own
                      block rather than a line in a table.
                    */}
                    {c.next_hearing && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-xs leading-relaxed text-dark">
                        <FiCalendar className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          <strong>{c.next_hearing.type}</strong> on{" "}
                          <strong>{dateTime(c.next_hearing.scheduled_at)}</strong> at the barangay
                          hall. Please appear — the Lupon may proceed without you if you do not.
                        </span>
                      </p>
                    )}

                    {c.settlement && (
                      <p className="mt-3 rounded-xl bg-secondary/70 px-3.5 py-2.5 text-xs leading-relaxed text-gray-600">
                        <strong>{c.settlement.type}</strong>
                        {c.settlement.agreed_on ? ` agreed ${date(c.settlement.agreed_on)}` : ""} —{" "}
                        {c.settlement.status}.
                        {c.settlement.certificate_to_file_action && (
                          <>
                            {" "}
                            A <strong>Certificate to File Action</strong> was issued, which lets the
                            case be taken to court.
                          </>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {blotters.length > 0 && (
            <Card title="Blotter entries">
              <div className="space-y-2">
                {blotters.map((b) => (
                  <div
                    key={b.blotter_number}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-dark">
                        {b.incident_type}
                        <span className="ml-2 font-mono text-[11px] font-normal text-gray-400">
                          {b.blotter_number}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {dateTime(b.incident_at) ?? dateTime(b.recorded_at)}
                        {b.place ? ` · ${b.place}` : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-gray-400">{b.my_role}</span>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-dark">
                        {b.action_taken}
                      </span>
                      <StatusBadge status={b.status} />
                    </span>
                  </div>
                ))}
              </div>

              {/*
                Said plainly, so nobody assumes the page is broken or that
                something is being kept from them without reason.
              */}
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-xs leading-relaxed text-gray-500">
                <FiFileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  What was written in the entry itself is not shown here. A blotter records one
                  person&rsquo;s account of an incident, and it is read at the barangay hall — ask
                  at the desk if you need a copy.
                </span>
              </p>
            </Card>
          )}

          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-gray-400">
            <FiBookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Confidential matters handled by the VAWC Desk never appear on this page or anywhere
              online. Follow those up in person at the barangay hall.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
