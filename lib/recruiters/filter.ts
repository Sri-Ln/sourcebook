import type { OutreachStatus, Recruiter } from '../models/types.js';

export interface RecruiterFilter {
  query: string;
  /** Empty means every status. */
  statuses: OutreachStatus[];
  /** Empty means every tag. */
  tags: string[];
}

export const EMPTY_FILTER: RecruiterFilter = { query: '', statuses: [], tags: [] };

/**
 * Fields worth searching. Notes are included deliberately: "posted about
 * backend openings" is often what you remember about someone months later,
 * when their job title has entirely left your head.
 */
function haystack(recruiter: Recruiter): string {
  return [
    recruiter.name,
    recruiter.headline,
    recruiter.company,
    recruiter.note,
    ...recruiter.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Filters the list.
 *
 * Kept pure and separate from the component so the matching rules can be tested
 * exhaustively without rendering anything — and so #22's options page can reuse
 * them if it ever needs to.
 */
export function filterRecruiters(
  recruiters: Recruiter[],
  { query, statuses, tags }: RecruiterFilter,
): Recruiter[] {
  // Every term must match, in any field. Typing more words should narrow the
  // list rather than widen it, which is what a naive OR would do.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return recruiters.filter((recruiter) => {
    if (statuses.length && !statuses.includes(recruiter.outreach)) return false;
    if (tags.length && !tags.some((tag) => recruiter.tags.includes(tag))) return false;

    if (!terms.length) return true;

    const text = haystack(recruiter);
    return terms.every((term) => text.includes(term));
  });
}

/** Every tag in use, sorted, for building the filter control. */
export function collectTags(recruiters: Recruiter[]): string[] {
  return [...new Set(recruiters.flatMap((recruiter) => recruiter.tags))].sort();
}

export function isFiltering({ query, statuses, tags }: RecruiterFilter): boolean {
  return Boolean(query.trim()) || statuses.length > 0 || tags.length > 0;
}
