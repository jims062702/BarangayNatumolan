/**
 * Sector taxonomy shared across the resident pages.
 *
 * Age brackets are assigned and kept current AUTOMATICALLY from the resident's
 * birthdate — they can never be added or removed by hand (the backend rejects
 * it, and the UI hides those controls). Everything else is a manually-assigned
 * status/economic/social sector.
 */

export const AGE_SECTORS = ["Child", "Youth", "Adult", "Senior Citizen"];

export const MANUAL_SECTORS = [
  "Solo Parent",
  "PWD",
  "4Ps Household",
  "Pregnant Women",
  "Indigent",
  "Unemployed",
  "Out-of-School Youth",
  "Farmer / Fisherfolk",
  "Informal Worker",
  "Children Under Five",
];

export const isAgeSector = (sector: string): boolean => AGE_SECTORS.includes(sector);
