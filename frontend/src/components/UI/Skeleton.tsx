/**
 * The shape of what is coming, while it comes.
 *
 * A spinner says "wait" and nothing else: the screen is blank, then it is
 * full, and the jump between the two is the whole experience. A skeleton says
 * where the tiles will be and how many, so the eye has already found the
 * headcount by the time the number lands — and a slow connection reads as a
 * page filling in rather than as a page that might be broken.
 *
 * Everything here is `aria-hidden`. A screen reader is told the region is
 * busy by the live region at the top of each skeleton; being read a list of
 * empty grey boxes helps nobody.
 */

/** One grey block. Give it a size with `className`, or with `style` when the
 *  size is worked out rather than written down. */
export default function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`block animate-pulse rounded-lg bg-gray ${className}`}
    />
  );
}

/**
 * The word a screen reader gets instead of the boxes.
 *
 * Placed once per skeleton region rather than on every block, so the
 * announcement is "Loading the dashboard", not "loading" forty times.
 */
function Busy({ what }: { what: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      Loading {what}
    </span>
  );
}

/** A stat tile: an icon square, a label, a number. */
export function TileSkeleton() {
  return (
    <div className="rounded-2xl border border-gray bg-white p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>
    </div>
  );
}

/**
 * A chart card: a title, then bars of uneven height.
 *
 * Uneven on purpose. A row of identical blocks reads as a table; a ragged one
 * reads as a chart, which is what is about to appear there.
 */
export function ChartSkeleton({
  height = 240,
  bars = 7,
  className = "",
}: {
  /** A floor, so the bars survive a short row — see BandChart. */
  height?: number;
  bars?: number;
  className?: string;
}) {
  const heights = [58, 84, 40, 96, 66, 74, 48, 90, 62, 36, 80, 52];

  return (
    <div className={`flex flex-col rounded-2xl border border-gray bg-white p-5 ${className}`}>
      <Skeleton className="mb-1.5 h-4 w-40" />
      <Skeleton className="mb-5 h-3 w-56" />

      <div className="flex min-h-0 flex-1 items-end gap-2" style={{ minHeight: height }}>
        {Array.from({ length: bars }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="min-w-0 flex-1 animate-pulse rounded-lg bg-gray"
            style={{ height: `${heights[i % heights.length]}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** A card of label-and-value rows — a summary list rather than a chart. */
export function ListSkeleton({
  rows = 4,
  title = true,
  className = "",
}: {
  rows?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-gray bg-white p-5 ${className}`}>
      {title && <Skeleton className="mb-4 h-4 w-40" />}
      <div className="divide-y divide-gray/70">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Rows with no card chrome, for a placeholder that is already inside a Card.
 *
 * ListSkeleton draws its own border; nesting that inside a Card gives two
 * borders a pixel apart, which reads as a rendering fault rather than as a
 * page loading.
 */
export function RowsSkeleton({ rows = 4, what = "the list" }: { rows?: number; what?: string }) {
  return (
    <div className="py-1">
      <Busy what={what} />
      <div className="divide-y divide-gray/70">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cards in a grid — an officials list, a slide list. */
export function CardGridSkeleton({ cards = 4, height = 140 }: { cards?: number; height?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Busy what="the list" />
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray bg-white p-5">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="w-full rounded-xl" style={{ height }} />
        </div>
      ))}
    </div>
  );
}

/** A form: a grid of labels and boxes. */
export function FormSkeleton({ fields = 9 }: { fields?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Busy what="the form" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** A table: a toolbar, a header rule, and rows. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-2xl border border-gray bg-white p-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-56 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="ml-auto h-9 w-24 rounded-full" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-4 border-b border-gray pb-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-1.5">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The whole application, before the session is known.
 *
 * This is what a refresh used to show as a spinner over an empty page. The
 * sidebar and the top bar are already where they will be, so the layout does
 * not jump when the session comes back — and the office can see the shape of
 * the thing they are waiting for.
 */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-secondary">
      <Busy what="the page" />

      {/* The sidebar keeps its own colour: it is drawn before the data. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-primary-dark lg:block">
        <div className="flex h-16 items-center gap-3 px-5">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/20" />
          <span className="h-4 w-32 animate-pulse rounded bg-white/20" />
        </div>
        <div className="space-y-2 px-4 pt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="block h-9 animate-pulse rounded-xl bg-white/10"
            />
          ))}
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <Skeleton className="h-8 w-28 rounded-full" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="hidden h-4 w-32 sm:block" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Skeleton className="mb-2 h-7 w-72" />
          <Skeleton className="mb-6 h-4 w-96" />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <TileSkeleton key={i} />
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartSkeleton height={260} bars={9} />
            </div>
            <div className="space-y-6">
              <ChartSkeleton height={140} bars={5} />
              <ListSkeleton rows={3} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The dashboard's own body, once the shell is already on screen. */
export function DashboardSkeleton() {
  return (
    <div>
      <Busy what="the dashboard" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartSkeleton height={260} bars={5} className="h-full" />
        </div>
        <div className="space-y-6">
          <ChartSkeleton height={160} bars={2} />
          <ListSkeleton rows={4} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6">
          <ListSkeleton rows={5} className="flex-1" />
          <ListSkeleton rows={3} className="flex-1" />
        </div>
        <div className="lg:col-span-2">
          <ChartSkeleton height={260} bars={12} className="h-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * What a PUBLIC page downloads behind.
 *
 * Deliberately shapeless. The sign-in page, the landing page and the
 * certificate check share nothing but a background, and the app shell — a
 * sidebar, a row of stat tiles, two charts — was being shown in front of all
 * three. A skeleton that promises a dashboard to somebody opening the login
 * page is not a loading state; it is a wrong answer that then jumps.
 */
export function PublicPageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary">
      <Busy what="the page" />
      <div className="flex flex-col items-center gap-4">
        <span className="h-14 w-14 animate-pulse rounded-full bg-primary/15" />
        <span className="h-3 w-40 animate-pulse rounded-full bg-gray" />
      </div>
    </div>
  );
}

/**
 * The sign-in page's own shape: the picture panel and the form beside it.
 *
 * This one IS worth drawing, because the layout is fixed and known — two
 * panels on a wide screen, the form alone on a phone — so the page that
 * arrives lands exactly where the skeleton said it would.
 */
export function LoginSkeleton() {
  return (
    <div className="flex min-h-screen bg-white">
      <Busy what="the sign-in page" />

      {/* The panel is a solid brand block, as it is on the real page. */}
      <div className="hidden w-1/2 bg-primary-dark lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <span className="h-4 w-32 animate-pulse rounded bg-white/20" />
          <div className="space-y-4">
            <span className="block h-20 w-20 animate-pulse rounded-full bg-white/20" />
            <span className="block h-10 w-80 animate-pulse rounded bg-white/20" />
            <span className="block h-5 w-56 animate-pulse rounded bg-white/15" />
            <span className="block h-16 w-72 animate-pulse rounded bg-white/10" />
          </div>
          <span className="h-3 w-48 animate-pulse rounded bg-white/15" />
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-secondary px-4 py-10 lg:w-1/2 lg:bg-white">
        <div className="w-full max-w-md space-y-6">
          {/* On a phone the branding sits above the form instead. */}
          <div className="space-y-3 text-center lg:hidden">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto h-6 w-52" />
          </div>

          <div className="hidden space-y-3 lg:block">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * An inner page, once the shell around it is already real.
 *
 * Modest on purpose. At this point the router knows a page is coming but not
 * what shape it is — a table, a form, a dashboard — so this draws only the
 * heading and one body block, which every one of them has. Anything more
 * specific would be a guess, and a guess that turns out wrong reads worse
 * than a plain wait. The pages that DO know their own shape carry their own
 * skeleton instead.
 */
export function PageBodySkeleton() {
  return (
    <div>
      <Busy what="the page" />
      <Skeleton className="mb-2 h-7 w-64" />
      <Skeleton className="mb-6 h-4 w-96" />
      <div className="rounded-2xl border border-gray bg-white p-6">
        <ListSkeleton rows={5} />
      </div>
    </div>
  );
}

/**
 * A dashboard body, in the geometry of the dashboard it belongs to.
 *
 * Parameterised rather than fixed, because the six dashboards are not the
 * same shape: the VAWC desk has four tiles over two cards, the SK has three
 * over one, the Main Office five over several rows. One skeleton for all of
 * them drew four tiles and two charts in front of every page, and whichever
 * one you opened, the real layout then jumped.
 *
 * It promises the GRID and nothing finer — how many tiles, how many cards,
 * how they are columned. That much is fixed per page and safe to draw; what
 * goes inside a card is not.
 */
export function DashboardBodySkeleton({
  tiles = 4,
  tileColumns = 4,
  cards = 2,
  cardColumns = 2,
  cardHeight = 280,
}: {
  tiles?: number;
  /** The xl: column count of the tile row, matching the page. */
  tileColumns?: 3 | 4 | 5;
  cards?: number;
  cardColumns?: 1 | 2 | 3;
  cardHeight?: number;
}) {
  /* Written out rather than interpolated: Tailwind scans source text, and a
     class it never sees written is a class it never builds. */
  const tileGrid = {
    3: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
    4: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
    5: "grid gap-4 sm:grid-cols-2 xl:grid-cols-5",
  }[tileColumns];

  const cardGrid = {
    1: "mt-6 grid gap-6",
    2: "mt-6 grid gap-6 lg:grid-cols-2",
    3: "mt-6 grid gap-6 lg:grid-cols-3",
  }[cardColumns];

  return (
    <div>
      <Busy what="the dashboard" />

      <div className={tileGrid}>
        {Array.from({ length: tiles }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>

      <div className={cardGrid}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray bg-white p-5">
            <Skeleton className="mb-4 h-5 w-48" />
            <Skeleton className="w-full rounded-xl" style={{ height: cardHeight }} />
          </div>
        ))}
      </div>
    </div>
  );
}
