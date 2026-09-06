import { Fragment, type ReactNode } from "react";
import { useReveal } from "../../hooks/useReveal";

/**
 * Something that plays itself again when it comes back into view.
 *
 * A card fading in is a CSS transition, and CSS replays on its own whenever
 * the class returns. A chart drawing its bars, or a number counting up, is
 * not: those animations run once, when the component mounts, and a dashboard
 * scrolled back to shows the finished picture with nothing to watch — beside
 * a card that has just moved, which reads as a chart that has frozen.
 *
 * So the subtree carries a key that changes each time it arrives, and
 * changing a key remounts it. Mounting is the only thing those animations
 * wait for.
 *
 * Use it for a CHART or another self-animating block. Do not wrap a table or
 * a form in it: remounting throws away scroll position, focus and any
 * half-typed answer, which is a high price for a redraw nobody asked for.
 */
export default function ReplayOnView({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, plays } = useReveal<HTMLDivElement>();

  return (
    <div ref={ref} className={className}>
      {/*
        Always rendered, so the chart takes up its room from the first paint.
        Holding it back until it had been seen would have left an empty box
        below the fold and shoved the page down the moment somebody scrolled
        to it — the layout jump this dashboard already has a floor to prevent.

        Playing early is not a problem: arriving changes the key, which
        remounts the subtree, so the animation runs again at the moment it is
        actually being watched.
      */}
      <Fragment key={plays}>{children}</Fragment>
    </div>
  );
}
