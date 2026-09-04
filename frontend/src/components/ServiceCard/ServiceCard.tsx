import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import Modal from "../UI/Modal";
import type { Service } from "../../data/services";

interface ServiceCardProps {
  service: Service;
}

// Standard fees (mirrors the backend fee schedule); services not listed here
// are quoted at the Main Office.
const FEES: Record<string, string> = {
  "Barangay Clearance": "₱50.00",
  "Certificate of Residency": "₱30.00",
  "Certificate of Indigency": "Free",
  "First-Time Jobseeker Certification": "Free (RA 11261)",
  "Certificate of Low or No Income": "Free",
  "Business Barangay Clearance": "₱200.00",
};

export default function ServiceCard({ service }: ServiceCardProps) {
  const Icon = service.icon;
  const [open, setOpen] = useState(false);
  const fee = FEES[service.name];

  return (
    <motion.article
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group flex h-full flex-col rounded-2xl border border-gray bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-dark">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">
        {service.description}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 inline-flex cursor-pointer items-center gap-2 self-start text-sm font-semibold text-primary transition-all duration-300 hover:gap-3.5"
      >
        Learn More <FiArrowRight aria-hidden="true" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={service.name}>
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-gray-600">{service.description}</p>
        </div>

        <dl className="mt-5 space-y-3">
          <div className="rounded-xl border border-gray/70 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Fee</dt>
            <dd className="mt-0.5 text-sm font-semibold text-dark">
              {fee ?? "Quoted at the Main Office (many services are free)"}
            </dd>
          </div>
          <div className="rounded-xl border border-gray/70 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
              How to avail
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-gray-600">
              <span className="block">
                1. Visit the <strong>Barangay Main Office</strong> (Mon–Fri, 8:00 AM–5:00 PM)
                with a valid ID — walk-ins are served the same day.
              </span>
              <span className="mt-1 block">
                2. Or{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  sign in to the resident portal
                </Link>{" "}
                to request online and track the status from home.
              </span>
            </dd>
          </div>
        </dl>
      </Modal>
    </motion.article>
  );
}
