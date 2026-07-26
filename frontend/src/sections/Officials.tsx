import { useEffect, useState } from "react";
import SectionTitle from "../components/SectionTitle/SectionTitle";
import OfficialCard from "../components/OfficialCard/OfficialCard";
import Reveal from "../components/UI/Reveal";
import { api } from "../lib/api";
import { readPublicCache, writePublicCache } from "../lib/publicContent";
import {
  barangayOfficials as staticBarangay,
  skOfficials as staticSk,
  type Official,
} from "../data/officials";
import fallbackAvatar from "../assets/images/avatar-1.svg";

interface OfficialsGroupProps {
  heading: string;
  officials: Official[];
}

interface ApiOfficial {
  id: number;
  position: string;
  name: string;
  term?: string | null;
  photo_url?: string | null;
}

function mapApi(rows: ApiOfficial[]): Official[] {
  return rows.map((o) => ({
    id: o.id,
    position: o.position,
    name: o.name,
    term: o.term ?? "",
    photo: o.photo_url || fallbackAvatar,
  }));
}

/**
 * Renders one group of officials in the pyramid layout:
 * head (featured) → 4 kagawads → 3 kagawads → secretary & treasurer.
 */
function OfficialsGroup({ heading, officials }: OfficialsGroupProps) {
  if (officials.length === 0) return null;
  const [head, ...rest] = officials;
  const rows = [rest.slice(0, 4), rest.slice(4, 7), rest.slice(7)];

  return (
    <div>
      <Reveal className="text-center">
        <h3 className="text-2xl font-bold text-dark sm:text-3xl">{heading}</h3>
        <span
          aria-hidden="true"
          className="mx-auto mt-3 block h-1 w-14 rounded-full bg-primary"
        />
      </Reveal>

      <Reveal delay={0.1} className="mt-10 flex justify-center">
        <OfficialCard official={head} featured />
      </Reveal>

      {rows.map((row, index) => (
        <Reveal
          key={index}
          delay={0.15 + index * 0.05}
          className="mt-10 flex flex-wrap justify-center gap-6 sm:gap-10"
        >
          {row.map((official) => (
            <OfficialCard key={official.id} official={official} />
          ))}
        </Reveal>
      ))}
    </div>
  );
}

interface OfficialsData {
  barangay: Official[];
  sk: Official[];
}

/** Placeholder pyramid shown while the officials load (no old-data flash). */
function OfficialsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-14">
      <div className="flex justify-center">
        <div className="h-56 w-44 animate-pulse rounded-2xl bg-white/70" />
      </div>
      <div className="mt-10 flex flex-wrap justify-center gap-6 sm:gap-10">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-48 w-36 animate-pulse rounded-2xl bg-white/70" />
        ))}
      </div>
    </div>
  );
}

export default function Officials() {
  // null = still deciding what to show (avoids flashing the bundled samples
  // before the SK-managed officials arrive). Seeded from sessionStorage so a
  // refresh shows the right officials instantly.
  const [data, setData] = useState<OfficialsData | null>(() =>
    readPublicCache<OfficialsData>("officials")
  );

  useEffect(() => {
    api
      .get("/officials")
      .then((r) => {
        const b = mapApi(r.data.data.barangay ?? []);
        const s = mapApi(r.data.data.sk ?? []);
        const next = {
          barangay: b.length > 0 ? b : staticBarangay,
          sk: s.length > 0 ? s : staticSk,
        };
        setData(next);
        // Cache only when at least one group is SK-managed — bundled asset
        // URLs change between builds.
        if (b.length > 0 || s.length > 0) writePublicCache("officials", next);
      })
      // API unavailable — keep cached officials if any, else bundled samples.
      .catch(() =>
        setData((current) => current ?? { barangay: staticBarangay, sk: staticSk })
      );
  }, []);

  return (
    <section id="officials" className="bg-secondary py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Leadership"
          title="Our Officials"
          subtitle="Meet the dedicated public servants working for every Natumolanon."
        />
        {data ? (
          <>
            <OfficialsGroup heading="Barangay Officials" officials={data.barangay} />
            <div className="mt-24">
              <OfficialsGroup
                heading="Sangguniang Kabataan Officials"
                officials={data.sk}
              />
            </div>
          </>
        ) : (
          <OfficialsSkeleton />
        )}
      </div>
    </section>
  );
}
