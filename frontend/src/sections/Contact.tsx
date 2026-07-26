import type { IconType } from "react-icons";
import { FaFacebookF, FaFacebookMessenger, FaEnvelope } from "react-icons/fa";
import { FiMapPin, FiPhone, FiMail, FiClock } from "react-icons/fi";
import SectionTitle from "../components/SectionTitle/SectionTitle";
import ContactForm from "../components/ContactForm/ContactForm";
import Reveal from "../components/UI/Reveal";

interface InfoItem {
  id: number;
  icon: IconType;
  label: string;
  value: string;
}

interface SocialLink {
  label: string;
  href: string;
  icon: IconType;
}

const infoItems: InfoItem[] = [
  {
    id: 1,
    icon: FiMapPin,
    label: "Barangay Address",
    value: "Barangay Natumolan, Tagoloan, Misamis Oriental 9001, Philippines",
  },
  {
    id: 2,
    icon: FiPhone,
    label: "Contact Number",
    value: "(088) 000-0000 · +63 917 000 0000",
  },
  {
    id: 3,
    icon: FiMail,
    label: "Email Address",
    value: "barangaynatumolan@gmail.com",
  },
  {
    id: 4,
    icon: FiClock,
    label: "Office Hours",
    value: "Monday – Friday, 8:00 AM – 5:00 PM",
  },
];

const socials: SocialLink[] = [
  { label: "Facebook", href: "https://www.facebook.com", icon: FaFacebookF },
  { label: "Messenger", href: "https://www.messenger.com", icon: FaFacebookMessenger },
  { label: "Gmail", href: "mailto:barangaynatumolan@gmail.com", icon: FaEnvelope },
];

export default function Contact() {
  return (
    <section id="contact" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionTitle
          eyebrow="Get In Touch"
          title="Contact Us"
          subtitle="Questions, requests, or concerns? Reach out — we are here to serve you."
        />

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Barangay information */}
          <Reveal direction="right">
            <h3 className="text-xl font-semibold text-dark">
              Barangay Information
            </h3>
            <ul className="mt-6 space-y-5">
              {infoItems.map(({ id, icon: Icon, label, value }) => (
                <li key={id} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-dark">{label}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{value}</p>
                  </div>
                </li>
              ))}
            </ul>

            <h4 className="mt-9 text-sm font-semibold uppercase tracking-wide text-dark">
              Follow Us
            </h4>
            <div className="mt-4 flex gap-3">
              {socials.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-300 hover:-translate-y-1 hover:bg-primary hover:text-white"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </Reveal>

          {/* Contact form */}
          <Reveal direction="left">
            <div className="rounded-3xl bg-secondary p-6 shadow-lg shadow-primary/5 sm:p-8">
              <ContactForm />
            </div>
          </Reveal>
        </div>

        {/* Map */}
        <Reveal delay={0.1} className="mt-14">
          <div className="overflow-hidden rounded-3xl shadow-lg shadow-primary/10">
            <iframe
              title="Map of Barangay Natumolan, Tagoloan, Misamis Oriental"
              src="https://www.google.com/maps?q=Natumolan,+Tagoloan,+Misamis+Oriental&output=embed"
              className="h-80 w-full border-0 sm:h-96"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
