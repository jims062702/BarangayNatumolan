import Reveal from "../UI/Reveal";

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}

/**
 * Standard section heading: eyebrow label, large title, accent bar,
 * and an optional subtitle.
 */
export default function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: SectionTitleProps) {
  const alignment =
    align === "left" ? "items-start text-left" : "items-center text-center";

  return (
    <Reveal className={`mb-12 flex flex-col gap-3 ${alignment} lg:mb-16`}>
      {eyebrow && (
        <span className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-bold text-dark sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <span className="h-1.5 w-20 rounded-full bg-primary" aria-hidden="true" />
      {subtitle && (
        <p className="max-w-2xl text-base leading-relaxed text-gray-500">
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
