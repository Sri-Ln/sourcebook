import type { Recruiter } from '../models/types.js';

/**
 * The identifying part of a profile, from wherever it was read.
 *
 * The in-page button has a full {@link ProfileDraft} extracted from the DOM; the
 * side panel has only the active tab's URL. Both can answer "is this person
 * already saved?", so the question takes the smaller shape.
 */
export interface ProfileIdentity {
  memberId?: string;
  profileUrl?: string;
}

/**
 * Reduces a profile URL to the one part that identifies a person.
 *
 * Needed because the two callers hold different URLs for the same profile. The
 * extractor already normalises what it reads from the page, but a tab URL is
 * raw: it carries tracking parameters, a trailing slash, and often a subpath
 * (`/in/jane/recent-activity/all`) because the content script mounts on those
 * pages too. Comparing those strings directly says "not saved" for someone who
 * plainly is.
 *
 * Returns `''` for anything that is not a profile URL. An empty key never
 * matches, so two records that both lack a URL are not treated as the same
 * person.
 */
export function profileKey(url: string | undefined): string {
  if (!url) return '';

  let parsed: URL;
  try {
    // Relative hrefs resolve against LinkedIn; the base is irrelevant to the
    // key, which is built from the path alone.
    parsed = new URL(url, 'https://www.linkedin.com');
  } catch {
    return '';
  }

  const [root, slug] = parsed.pathname.split('/').filter(Boolean);
  if (root !== 'in' || !slug) return '';

  return `/in/${slug.toLowerCase()}`;
}

/**
 * Finds the saved record for a profile, if there is one.
 *
 * **memberId first.** Vanity URLs are user-changeable, so two links to the same
 * person can differ while the id stays put. The URL is the fallback for records
 * saved before an id could be read — and the only thing the side panel has,
 * since reading an id means reaching into the page.
 */
export function findSaved(
  recruiters: readonly Recruiter[],
  { memberId, profileUrl }: ProfileIdentity,
): Recruiter | undefined {
  if (memberId !== undefined) {
    const byId = recruiters.find((r) => r.memberId === memberId);
    if (byId) return byId;
  }

  const key = profileKey(profileUrl);
  if (!key) return undefined;

  return recruiters.find((r) => profileKey(r.profileUrl) === key);
}
