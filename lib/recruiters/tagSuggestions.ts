import type { Recruiter } from '../models/types.js';

/**
 * Tag suggestions, built from the tags you have already used.
 *
 * There is no preset vocabulary and nothing is stored for this. The whole
 * feature is a view over `recruiter.tags`, which means it is empty on day one
 * and useful by the twentieth save, and it can never suggest a word you did not
 * choose yourself.
 */

/** How many to offer with nothing part-typed. Three fits the row; twenty does not. */
export const RESTING_LIMIT = 3;

/** How many matches to offer while typing, where the list is doing real work. */
export const MATCH_LIMIT = 6;

/**
 * Every tag in use, most-used first.
 *
 * Grouped case-insensitively so `fintech` and `Fintech` are one suggestion
 * rather than two, keeping whichever spelling is more common — offering both
 * would actively encourage the split it should be helping to avoid. Ties break
 * alphabetically, so the order is stable rather than dependent on save order.
 */
export function rankTags(recruiters: readonly Recruiter[]): string[] {
  /** One entry per tag, case-insensitively, counting each spelling separately. */
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();

  for (const recruiter of recruiters) {
    for (const raw of recruiter.tags) {
      const tag = raw.trim();
      if (!tag) continue;

      const key = tag.toLowerCase();
      const group = groups.get(key) ?? { total: 0, spellings: new Map<string, number>() };

      group.total += 1;
      group.spellings.set(tag, (group.spellings.get(tag) ?? 0) + 1);
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map(({ total, spellings }) => ({
      total,
      // The spelling you use most often is the one worth offering back.
      label: [...spellings.entries()].sort(
        ([leftTag, leftCount], [rightTag, rightCount]) =>
          rightCount - leftCount || leftTag.localeCompare(rightTag),
      )[0]![0],
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .map((entry) => entry.label);
}

/**
 * The tag currently being typed: everything after the last comma.
 *
 * The field holds a comma-separated list, so "fintech, spo" is one finished tag
 * and one in progress. This is why a native `<datalist>` is not enough — it
 * matches against the whole field value, so it would look for a tag literally
 * named "fintech, spo" and offer nothing.
 */
export function activeFragment(text: string): string {
  return text.slice(text.lastIndexOf(',') + 1).trim();
}

export interface SuggestOptions {
  /** Output of {@link rankTags}. */
  ranked: readonly string[];
  /** Tags already on this record, which are not worth offering again. */
  applied: readonly string[];
  /** Output of {@link activeFragment}. */
  fragment: string;
  restingLimit?: number;
  matchLimit?: number;
}

/**
 * What to put in the suggestion row.
 *
 * Two modes on purpose. At rest it is the few most-used tags, because a wall of
 * twenty chips is not a shortcut. Once something is part-typed it becomes
 * matches for that fragment drawn from the *whole* vocabulary, which is how the
 * tags outside the top few stay reachable.
 */
export function suggestTags({
  ranked,
  applied,
  fragment,
  restingLimit = RESTING_LIMIT,
  matchLimit = MATCH_LIMIT,
}: SuggestOptions): string[] {
  const taken = new Set(applied.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const available = ranked.filter((tag) => !taken.has(tag.toLowerCase()));

  if (!fragment) return available.slice(0, restingLimit);

  const needle = fragment.toLowerCase();

  // Prefix matches first: typing "spo" means you are heading for a tag that
  // starts that way, and burying it under a substring hit reads as broken.
  const prefix = available.filter((tag) => tag.toLowerCase().startsWith(needle));
  const contains = available.filter(
    (tag) => !tag.toLowerCase().startsWith(needle) && tag.toLowerCase().includes(needle),
  );

  return [...prefix, ...contains].slice(0, matchLimit);
}

/**
 * Puts `tag` into the field, completing what was part-typed or appending.
 *
 * Leaves a trailing ", " so the next tag can be typed straight away, and so the
 * suggestion row goes back to resting rather than trying to match the tag that
 * was just accepted.
 */
export function withTag(text: string, tag: string): string {
  const cut = text.lastIndexOf(',');
  const head = cut === -1 ? '' : text.slice(0, cut + 1);
  const prefix = head ? `${head.trimEnd()} ` : '';

  return `${prefix}${tag}, `;
}
