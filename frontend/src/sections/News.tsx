import SectionTitle from "../components/SectionTitle/SectionTitle";
import NewsCarousel from "../components/NewsCarousel/NewsCarousel";
import Reveal from "../components/UI/Reveal";

export default function News() {
  return (
    <section id="news" className="bg-secondary py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Stay Updated"
          title="News & Announcements"
          subtitle="The latest happenings, programs, and advisories from your barangay government."
        />
        <Reveal delay={0.1}>
          <NewsCarousel />
        </Reveal>
      </div>
    </section>
  );
}
