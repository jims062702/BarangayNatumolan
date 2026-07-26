import { useEffect, useState } from "react";

/**
 * Returns the id of the section currently crossing the upper third of the
 * viewport, so the navbar can highlight the matching link.
 *
 * NOTE: pass a stable array (defined outside the component) to avoid
 * re-creating the observer on every render.
 */
export default function useActiveSection(sectionIds: readonly string[]): string {
  const [active, setActive] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}
