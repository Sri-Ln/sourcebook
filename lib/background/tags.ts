import type { Recruiter } from '../models/types.js';

export interface TagUsage {
  tag: string;
  /** Records carrying this tag — not occurrences. A delete affects this many. */
  count: number;
}

/**
 * Every tag in use, with how many records would be affected by changing it.
 *
 * Derived rather than stored. A separate tag index would be a second source of
 * truth that drifts the first time a record is removed by another surface.
 */
export function collectTags(recruiters: readonly Recruiter[]): TagUsage[] {
  const counts = new Map<string, number>();

  for (const recruiter of recruiters) {
    // Deduped per record so a record tagged `['a', 'a']` does not promise that
    // deleting `a` touches two records when it touches one.
    for (const tag of new Set(recruiter.tags)) {
      if (tag.trim() === '') continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Returns the record with `tags` replaced, or `null` if nothing changed.
 *
 * `null` is the whole point: it tells the store not to write. Rewriting every
 * record on a rename would spend the 120-writes-per-minute budget on data that
 * did not move.
 */
function withTags(recruiter: Recruiter, tags: string[], now: string): Recruiter | null {
  const unchanged =
    tags.length === recruiter.tags.length && tags.every((tag, i) => tag === recruiter.tags[i]);

  if (unchanged) return null;

  return { ...recruiter, tags, updatedAt: now };
}

/**
 * Matching is exact and case-sensitive on purpose. Merging "Fintech" into
 * "fintech" is the commonest reason to rename, and a case-insensitive match
 * would make that merge impossible to express.
 */
export function renameTagIn(
  recruiter: Recruiter,
  from: string,
  to: string,
  now = new Date().toISOString(),
): Recruiter | null {
  const target = to.trim();
  if (target === '') return null;

  const renamed = recruiter.tags.map((tag) => (tag === from ? target : tag));

  // Deduped because renaming into a tag the record already carries is a merge,
  // and a record listing the same tag twice is not what the user asked for.
  return withTags(recruiter, [...new Set(renamed)], now);
}

export function removeTagFrom(
  recruiter: Recruiter,
  tag: string,
  now = new Date().toISOString(),
): Recruiter | null {
  return withTags(
    recruiter,
    recruiter.tags.filter((existing) => existing !== tag),
    now,
  );
}
