import type { Recruiter } from '../models/types.js';

export interface CompanyGroup {
  company: string;
  recruiters: Recruiter[];
}

/** Shown for records whose company is not known, kept last in the list. */
export const UNKNOWN_COMPANY = 'No company';

/**
 * Groups recruiters by company, alphabetically, with unknowns last.
 *
 * Company is the axis that matters: you look someone up because a role opened
 * at their employer, not because of when you happened to save them. Grouping
 * also makes it obvious when you already know three people somewhere.
 *
 * Companies are matched case-insensitively and trimmed, so "Stripe" and
 * "stripe " land together — but the label keeps the first spelling seen rather
 * than lowercasing it, because "STRIPE" is not how anyone writes it.
 */
export function groupByCompany(recruiters: Recruiter[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();

  for (const recruiter of recruiters) {
    const label = recruiter.company?.trim() || UNKNOWN_COMPANY;
    const key = label.toLowerCase();

    const existing = groups.get(key);
    if (existing) existing.recruiters.push(recruiter);
    else groups.set(key, { company: label, recruiters: [recruiter] });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      // Within a company, most recently saved first — the newest contact is
      // usually the one you are about to act on.
      recruiters: [...group.recruiters].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    }))
    .sort((a, b) => {
      // Unknowns last regardless of alphabet: they are the least useful group
      // and should not sit above real companies.
      if (a.company === UNKNOWN_COMPANY) return 1;
      if (b.company === UNKNOWN_COMPANY) return -1;
      return a.company.localeCompare(b.company, undefined, { sensitivity: 'base' });
    });
}
