import SectionTitle from "../components/SectionTitle/SectionTitle";
import OfficeCard from "../components/OfficeCard/OfficeCard";
import Reveal from "../components/UI/Reveal";
import { offices } from "../data/offices";

export default function Offices() {
  return (
    <section id="offices" className="pattern pattern-dashed-grid bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Serving You"
          title="Barangay Offices"
          subtitle="Dedicated desks and offices ready to assist residents with their specific needs."
        />
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {offices.map((office, index) => (
            <Reveal
              key={office.id}
              delay={(index % 3) * 0.1}
              className="h-full"
            >
              <OfficeCard office={office} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
