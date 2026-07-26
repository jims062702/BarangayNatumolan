import SectionTitle from "../components/SectionTitle/SectionTitle";
import ServiceCard from "../components/ServiceCard/ServiceCard";
import Reveal from "../components/UI/Reveal";
import { services } from "../data/services";

export default function Services() {
  return (
    <section id="services" className="bg-secondary py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="What We Offer"
          title="Barangay Services"
          subtitle="Certificates, clearances, permits, and assistance — processed quickly and fairly for every resident."
        />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <Reveal
              key={service.id}
              delay={(index % 4) * 0.08}
              className="h-full"
            >
              <ServiceCard service={service} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
