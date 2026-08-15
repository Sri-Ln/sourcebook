import { browser } from 'wxt/browser';
import { EMPTY_FILTER, type RecruiterFilter } from './filter.js';
import { OUTREACH_STATUSES, type OutreachStatus } from '../models/types.js';

const KEY = 'popup:filter';

/**
 * The popup closes the moment focus leaves it — clicking a profile link is
 * enough. Losing the filter every time would make it useless for working
 * through a list, which is precisely when you want one.
 *
 * Local rather than sync: this is a transient view preference, and it would
 * spend the sync byte budget that recruiters need.
 */
export const filterStore = {
  async load(): Promise<RecruiterFilter> {
    const stored = (await browser.storage.local.get(KEY))[KEY];
    return sanitise(stored);
  },

  async save(filter: RecruiterFilter): Promise<void> {
    await browser.storage.local.set({ [KEY]: filter });
  },
};

/**
 * Stored filters are untrusted input like anything else on disk: a tag may have
 * been deleted, or a status renamed by a future version. An unknown status
 * would silently match nothing and look like data loss.
 */
function sanitise(value: unknown): RecruiterFilter {
  if (!value || typeof value !== 'object') return EMPTY_FILTER;

  const raw = value as Partial<Record<keyof RecruiterFilter, unknown>>;
  const statuses = Array.isArray(raw.statuses)
    ? raw.statuses.filter((s): s is OutreachStatus =>
        OUTREACH_STATUSES.includes(s as OutreachStatus),
      )
    : [];

  return {
    query: typeof raw.query === 'string' ? raw.query : '',
    statuses,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    due: raw.due === true,
  };
}
