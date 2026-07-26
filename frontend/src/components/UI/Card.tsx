import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, action, children, className = "" }: CardProps) {
  return (
    <section className={`rounded-2xl border border-gray bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-dark">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
