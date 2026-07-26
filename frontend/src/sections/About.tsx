import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { FaLandmark, FaBullseye, FaEye } from "react-icons/fa";
import { FiHome, FiMap, FiUsers } from "react-icons/fi";
import SectionTitle from "../components/SectionTitle/SectionTitle";
import Reveal from "../components/UI/Reveal";
import CountUp from "../components/UI/CountUp";
import { api } from "../lib/api";

interface BarangayStats {
  registered_residents: number;
  households: number;
  puroks: number;
}

interface AboutCard {
  id: number;
  icon: IconType;
  title: string;
  description: string;
}

const cards: AboutCard[] = [
  {
    id: 1,
    icon: FaLandmark,
    title: "Barangay Overview",
    description:
      "Barangay Natumolan is one of the vibrant barangays of Tagoloan, Misamis Oriental. From its humble beginnings as a small riverside settlement, it has grown into a progressive community of hardworking families, thriving local enterprises, and a barangay government committed to honest public service.",
  },
  {
    id: 2,
    icon: FaBullseye,
    title: "Mission",
    description:
      "To deliver responsive, transparent, and efficient public service; to promote peace and order, health, and livelihood opportunities; and to empower every resident to take part in building a safe, inclusive, and self-reliant community.",
  },
  {
    id: 3,
    icon: FaEye,
    title: "Vision",
    description:
      "A peaceful, progressive, and environment-friendly Barangay Natumolan, with God-loving, healthy, and empowered residents, led by officials who serve with integrity, unity, and excellence.",
  },
];

export default function About() {
  const [stats, setStats] = useState<BarangayStats | null>(null);

  useEffect(() => {
    api
      .get("/stats")
      .then((r) => setStats(r.data.data))
      .catch(() => undefined); // hide the band if the API is unavailable
  }, []);

  return (
    <section id="about" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Who We Are"
          title="About Barangay Natumolan"
          subtitle="Get to know our community, what drives us, and where we are headed."
        />
        <div className="grid gap-8 md:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.id} delay={index * 0.12} className="h-full">
                <article className="flex h-full flex-col rounded-2xl bg-secondary p-8 shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold text-dark">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    {card.description}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>

        {/* Barangay at a glance — live counts from the Population Office.
            The numbers re-count every time this block scrolls into view. */}
        {stats && (
          <div className="mt-16">
            <Reveal className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                Barangay Natumolan at a Glance
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
                Live figures straight from the Barangay Population Office registry.
              </p>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {/* Registered residents — featured */}
              <Reveal delay={0.05} className="h-full">
                <div className="flex h-full flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-dark px-6 py-10 text-center text-white shadow-xl shadow-primary/25">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                    <FiUsers className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-5xl font-extrabold leading-none sm:text-6xl">
                    <CountUp value={stats.registered_residents} repeat />
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white/90">
                    Registered Residents
                  </p>
                </div>
              </Reveal>

              {/* Households */}
              <Reveal delay={0.15} className="h-full">
                <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-gray bg-white px-6 py-10 text-center shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FiHome className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-5xl font-extrabold leading-none text-primary sm:text-6xl">
                    <CountUp value={stats.households} repeat />
                  </p>
                  <p className="mt-3 text-sm font-semibold text-dark">Households</p>
                </div>
              </Reveal>

              {/* Puroks / Zones */}
              <Reveal delay={0.25} className="h-full">
                <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-gray bg-white px-6 py-10 text-center shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FiMap className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-5xl font-extrabold leading-none text-primary sm:text-6xl">
                    <CountUp value={stats.puroks} repeat />
                  </p>
                  <p className="mt-3 text-sm font-semibold text-dark">Puroks / Zones</p>
                </div>
              </Reveal>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
