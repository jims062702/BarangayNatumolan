import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FiClock, FiMapPin, FiUser } from "react-icons/fi";
import Button from "../Button/Button";
import Modal from "../UI/Modal";
import type { Office } from "../../data/offices";

interface OfficeCardProps {
  office: Office;
}

export default function OfficeCard({ office }: OfficeCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md transition-shadow duration-300 hover:shadow-2xl hover:shadow-primary/15"
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={office.image}
          alt={office.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-semibold leading-snug text-dark">
          {office.name}
        </h3>
        <p className="mt-1.5 text-sm font-semibold text-primary">
          {office.personnel}
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {office.position}
        </p>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-500">
          {office.description}
        </p>
        <div className="mt-5">
          <Button
            variant="ghost"
            className="border border-primary/30"
            onClick={() => setOpen(true)}
          >
            View Details
          </Button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={office.name} wide>
        <img
          src={office.image}
          alt={office.name}
          className="h-52 w-full rounded-2xl object-cover sm:h-64"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray/70 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <FiUser className="text-primary" aria-hidden="true" /> In charge
            </p>
            <p className="mt-1 text-sm font-semibold text-dark">{office.personnel}</p>
            <p className="text-xs text-gray-500">{office.position}</p>
          </div>
          <div className="rounded-xl border border-gray/70 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <FiClock className="text-primary" aria-hidden="true" /> Office hours
            </p>
            <p className="mt-1 text-sm font-semibold text-dark">Monday – Friday</p>
            <p className="text-xs text-gray-500">8:00 AM – 5:00 PM</p>
          </div>
          <div className="rounded-xl border border-gray/70 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              <FiMapPin className="text-primary" aria-hidden="true" /> Where
            </p>
            <p className="mt-1 text-sm font-semibold text-dark">Barangay Hall</p>
            <p className="text-xs text-gray-500">Natumolan, Tagoloan, Mis. Or.</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-gray-600">{office.description}</p>
        <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm text-gray-600">
          Walk in during office hours, or{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            sign in to the resident portal
          </Link>{" "}
          to request services online.
        </p>
      </Modal>
    </motion.article>
  );
}
