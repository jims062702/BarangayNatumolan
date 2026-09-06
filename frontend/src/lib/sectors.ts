/**
 * Sector taxonomy shared across the resident pages.
 *
 * Age brackets are assigned and kept current AUTOMATICALLY from the resident's
 * birthdate — they can never be added or removed by hand (the backend rejects
 * it, and the UI hides those controls). Everything else is a manually-assigned
 * status/economic/social sector.
 */

/**
 * Worked out from the birthdate, and kept current on its own.
 *
 * Children Under Five belongs here and not below: it is a fact about a
 * birthday. Left to be ticked and unticked by hand, the under-five list fills
 * with six-year-olds nobody remembered to take off and misses the babies born
 * since anybody last went through the register.
 */
export const AGE_SECTORS = [
  "Children Under Five",
  "Child",
  "Youth",
  "Adult",
  "Senior Citizen",
];

/**
 * Assigned by a person, because each one is a STATUS somebody has to have
 * granted, judged or registered — not something a birthday decides.
 *
 * Five more used to sit here: Pregnant Women, Unemployed, Out-of-School
 * Youth, Farmer / Fisherfolk and Informal Worker. They were in the taxonomy
 * because they appear on national forms, not because this office keeps them,
 * and a list nobody updates is worse than no list — it gets consulted, it is
 * wrong, and whoever relied on it has no way to know.
 */
export const MANUAL_SECTORS = [
  "Solo Parent",
  "PWD",
  "4Ps Household",
  "Indigent",
];

export const isAgeSector = (sector: string): boolean => AGE_SECTORS.includes(sector);
