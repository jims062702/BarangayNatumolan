import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAward, FiBell, FiExternalLink, FiImage } from "react-icons/fi";
import { api } from "../../lib/api";
import { useAutoRefresh, REFRESH } from "../../hooks/useAutoRefresh";
import Card from "../../components/UI/Card";
import StatTile from "../../components/UI/StatTile";
import PageHeader from "../../components/UI/PageHeader";
import RevealGroup from "../../components/UI/RevealGroup";

export default function SkDashboard() {
  const [heroCount, setHeroCount] = useState(0);
  const [officialCount, setOfficialCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  // Live updates: bump `tick` to re-run the fetches below.
  const [tick, setTick] = useState(0);
  useAutoRefresh(() => setTick((t) => t + 1), REFRESH.dashboard);

  useEffect(() => {
    api.get("/sk/hero-slides").then((r) => setHeroCount((r.data.data ?? []).length)).catch(() => undefined);
    api.get("/sk/officials").then((r) => setOfficialCount((r.data.data ?? []).length)).catch(() => undefined);
    api.get("/sk/announcements").then((r) => setNewsCount(r.data.data.total ?? 0)).catch(() => undefined);
  }, [tick]);

  return (
    <div>
      <PageHeader
        title="Sangguniang Kabataan"
        subtitle="The barangay youth organization — publishes news & announcements and curates the public landing page (home pictures, news, officials)"
        actions={
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <FiExternalLink aria-hidden="true" /> View public site
          </a>
        }
      />

      <RevealGroup className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Home Pictures" value={heroCount} icon={FiImage} />
        <StatTile label="News & Announcements" value={newsCount} icon={FiBell} tone="warning" />
        <StatTile label="Officials Listed" value={officialCount} icon={FiAward} tone="success" />
      </RevealGroup>

      <Card title="Manage landing content" className="mt-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { to: "/sk/hero-slides", label: "Home Pictures", icon: FiImage, hint: "Hero carousel photos" },
            { to: "/sk/announcements", label: "News & Announcements", icon: FiBell, hint: "Posts shown to residents" },
            { to: "/sk/officials", label: "Officials", icon: FiAward, hint: "Barangay & SK officials" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col gap-1 rounded-2xl border border-gray p-5 transition-colors hover:border-primary"
            >
              <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <span className="mt-1 font-semibold text-dark">{item.label}</span>
              <span className="text-xs text-gray-500">{item.hint}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
