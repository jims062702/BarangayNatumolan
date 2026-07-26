import Home from "../sections/Home";
import News from "../sections/News";
import About from "../sections/About";
import Services from "../sections/Services";
import Offices from "../sections/Offices";
import Officials from "../sections/Officials";
import Contact from "../sections/Contact";

/** Public landing page — the original marketing site, served at "/". */
export default function LandingPage() {
  return (
    <>
      <Home />
      <News />
      <About />
      <Services />
      <Offices />
      <Officials />
      <Contact />
    </>
  );
}
