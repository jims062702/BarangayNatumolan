import { Children, cloneElement, isValidElement, type ReactNode } from "react";

/**
 * A row of cards that arrives rather than appears.
 *
 * Four tiles fading in at the same instant reads as the page snapping into
 * place. Thirty milliseconds between them reads as the page arriving — and
 * the whole row is still done inside a fifth of a second, so nobody is left
 * waiting on the last one.
 *
 * The delay is handed to each child rather than applied here, because the
 * children ARE the animated elements: wrapping each one would add a div to
 * every grid cell and break the `h-full` chain that keeps a row level.
 */
export default function RevealGroup({
  children,
  className = "",
  step = 30,
  start = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds between one child and the next. */
  step?: number;
  /** Milliseconds before the first one. */
  start?: number;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) =>
        /*
         * Anything that is not an element — a false from a conditional, a
         * string — is passed straight through. Only components that take a
         * `delay` do anything with it; the rest ignore an unknown prop.
         */
        isValidElement<{ delay?: number }>(child)
          ? cloneElement(child, { delay: start + i * step })
          : child
      )}
    </div>
  );
}
