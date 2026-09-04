import { useState } from "react";

/**
 * A row's tags, with the overflow behind a button.
 *
 * A resident can sit in nine sector lists. Printed in full they wrapped onto
 * three lines and pushed every other row apart, so a page of twenty became a
 * page of scrolling.
 *
 * The first attempt hid the rest behind a tooltip, which was worse: a clerk
 * cannot hover over what they do not know is there. Nothing on screen said
 * the tooltip existed, so the extra sectors were effectively invisible —
 * hidden information that looks like no information is how a Solo Parent
 * gets missed off a list.
 *
 * So the overflow is a BUTTON. It says how many are behind it, it looks like
 * something you press, and pressing it opens that one row in place. Only the
 * row the clerk asked about grows.
 */

interface Props {
  labels: string[];
  /** How many to show before the rest go behind the button. */
  limit?: number;
  /** Said aloud on the button, e.g. "sectors". */
  noun?: string;
}

export default function TagCell({ labels, limit = 3, noun = "sectors" }: Props) {
  const [open, setOpen] = useState(false);

  if (labels.length === 0) {
    return <span className="text-gray-400">—</span>;
  }

  const hidden = labels.length - limit;
  const shown = open ? labels : labels.slice(0, limit);

  return (
    <span className={`flex items-center gap-1 ${open ? "flex-wrap" : ""}`}>
      {shown.map((label) => (
        <span
          key={label}
          className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {label}
        </span>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={(e) => {
            // The row around this may be a link; opening a cell is not
            // a request to navigate away from the page.
            e.stopPropagation();
            setOpen(!open);
          }}
          aria-expanded={open}
          title={open ? `Hide the other ${hidden}` : `Show all ${labels.length} ${noun}`}
          className="cursor-pointer whitespace-nowrap rounded-full border border-gray bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-500 transition-colors hover:border-primary hover:text-primary"
        >
          {open ? "Show less" : `+${hidden} more`}
        </button>
      )}
    </span>
  );
}
