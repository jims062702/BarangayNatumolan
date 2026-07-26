import HeroCarousel from "../components/HeroCarousel/HeroCarousel";
import ScrollIndicator from "../components/ScrollIndicator/ScrollIndicator";

export default function Home() {
  return (
    <section id="home" aria-label="Home" className="relative">
      <HeroCarousel />
      <ScrollIndicator targetId="news" />
    </section>
  );
}
