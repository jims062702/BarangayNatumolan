import { FiCheck } from "react-icons/fi";

/**
 * A question with two or three answers, as buttons.
 *
 * These pile up in the family forms — is this person new, do they live here,
 * which household, is the other parent on the register — and when each pair
 * was styled by hand they came out identical, unlabelled, and stacked on top
 * of one another. A clerk could not tell what any pair was asking, nor which
 * answer was chosen, because the only difference between chosen and not was a
 * shade of purple.
 *
 * So the question is always shown and the chosen answer carries a TICK as
 * well as the colour — the tick is what survives a washed-out screen, and it
 * is what a clerk glances at rather than comparing two shades of purple.
 */

export interface Choice<T> {
  value: T;
  label: string;
  /** Shown under the group once this answer is the chosen one. */
  hint?: string;
}

interface Props<T> {
  /** The question. Omit only when a heading directly above already asks it. */
  label?: string;
  hint?: string;
  /**
   * null when the question has not been answered. Then no button is ticked
   * and none is coloured in — which is the honest picture, and the only one
   * that makes "you still have to choose" visible.
   */
  value: T | null;
  onChange: (value: T) => void;
  options: Choice<T>[];
  /** Fill the row evenly — for two answers of similar weight. */
  stretch?: boolean;
  /**
   * Pressing the chosen answer again takes it back.
   *
   * For a question that MAY go unanswered — where a stray click would
   * otherwise leave a fact on the record that nobody meant to state, and no
   * way to take it off short of reloading the form.
   *
   * Off by default, because most of these choose which fields come next: a
   * relation, a union type, whether somebody lives outside. Clearing one of
   * those mid-form leaves it with no path forward, which is worse than a
   * misclick.
   */
  clearable?: boolean;
  /** Called with null when a clearable answer is taken back. */
  onClear?: () => void;
}

export default function ChoiceGroup<T extends string | number | boolean>({
  label,
  hint,
  value,
  onChange,
  options,
  stretch = true,
  clearable = false,
  onClear,
}: Props<T>) {
  const chosen = options.find((option) => option.value === value);

  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium text-dark">{label}</p>}
      {hint && <p className="mb-2 text-xs leading-relaxed text-gray-400">{hint}</p>}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = option.value === value;

          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => (on && clearable ? onClear?.() : onChange(option.value))}
              aria-pressed={on}
              title={on && clearable ? "Press again to take this answer back" : undefined}
              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                stretch ? "flex-1" : ""
              } ${
                on ? "bg-primary text-white" : "bg-secondary text-dark hover:bg-primary/10"
              }`}
            >
              {/*
                A tick only on the chosen one. An empty circle on the others
                was clutter, and the whole point is that "which did I pick?"
                should not rest on telling two shades apart.
              */}
              {on && <FiCheck aria-hidden="true" className="h-4 w-4 shrink-0" />}
              {option.label}
            </button>
          );
        })}
      </div>

      {/*
        Said out loud, because nothing about a pressed button suggests that
        pressing it again undoes it.
      */}
      {clearable && chosen && (
        <p className="mt-1.5 text-[11px] text-gray-400">
          Press <strong className="font-semibold">{chosen.label}</strong> again to take it back.
        </p>
      )}

      {chosen?.hint && (
        <p className="mt-2 rounded-xl bg-secondary/70 px-4 py-2.5 text-xs leading-relaxed text-gray-600">
          {chosen.hint}
        </p>
      )}
    </div>
  );
}
