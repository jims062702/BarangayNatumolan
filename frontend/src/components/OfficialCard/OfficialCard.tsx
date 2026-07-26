import { motion } from "framer-motion";
import type { Official } from "../../data/officials";

interface OfficialCardProps {
  official: Official;
  /** Larger, centered variant for the Punong Barangay / SK Chairperson. */
  featured?: boolean;
}

export default function OfficialCard({ official, featured = false }: OfficialCardProps) {
  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`group text-center ${featured ? "w-48 sm:w-60" : "w-38 sm:w-44"}`}
    >
      <div className="mx-auto overflow-hidden rounded-2xl bg-white shadow-md transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-primary/20">
        <img
          src={official.photo}
          alt={`Portrait of ${official.name}`}
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      </div>
      <p
        className={`mt-3 font-semibold uppercase tracking-wide text-primary ${
          featured ? "text-xs" : "text-[11px]"
        }`}
      >
        {official.position}
      </p>
      <h3
        className={`mt-0.5 font-semibold text-dark ${
          featured ? "text-base" : "text-sm"
        }`}
      >
        {official.name}
      </h3>
      <p className="text-xs text-gray-400">{official.term}</p>
    </motion.article>
  );
}
