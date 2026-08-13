import type { JobDescription, QuarantinedRecord } from '../models/types.js';
import type { StorageUsage } from './SyncProvider.js';

/**
 * `chrome.storage.local` allows 10MB while the `unlimitedStorage` permission is
 * not requested — and it deliberately is not, because that permission widens the
 * store-review surface for a ceiling this extension is nowhere near.
 *
 * Two orders of magnitude above the sync quota, which is the whole reason job
 * descriptions live here: a single description's raw text can exceed the entire
 * 102,400-byte sync namespace on its own.
 */
export const LOCAL_QUOTA_BYTES = 10_485_760;

/** Every job description is its own item. See `ChromeLocalStore` for why. */
export const JOB_DESCRIPTION_KEY_PREFIX = 'jd:';

export function jobDescriptionKey(id: string): string {
  return `${JOB_DESCRIPTION_KEY_PREFIX}${id}`;
}

/**
 * Reading returns survivors *and* casualties, for the same reason `ListResult`
 * does: a record that failed validation is a diagnosable problem, and silently
 * omitting it would turn corruption into disappearance.
 */
export interface JobListResult {
  jobs: JobDescription[];
  quarantined: QuarantinedRecord[];
}

/**
 * Why a stamp can fail.
 *
 * - `not-found` — nothing is stored under that id. Reported rather than
 *   silently creating a record, because a stamp is an edit, not a capture.
 * - `unreadable` — the stored record failed validation. Stamping it would
 *   rewrite it through the parser and launder corruption into something that
 *   looks fine; worse, for a record from a newer build it would delete the
 *   fields this version does not know about.
 * - `invalid-update` — the stamp itself would produce an invalid record, e.g. a
 *   timestamp that is not ISO 8601. Caught before the write, because otherwise
 *   it resurfaces as a quarantined read long after the cause is forgotten.
 */
export type StampFailureReason = 'not-found' | 'unreadable' | 'invalid-update';

export type StampResult =
  | { ok: true; job: JobDescription }
  | { ok: false; reason: StampFailureReason; errors: string[] };

/**
 * The swap seam for job descriptions, mirroring `SyncProvider`.
 *
 * Separate from `SyncProvider` rather than a second implementation of it
 * because the two namespaces have genuinely different shapes: local storage has
 * no per-item cap and no write-rate limit, and job descriptions carry an
 * `exportedAt` lifecycle that recruiters have no equivalent of.
 */
export interface LocalStore {
  list(): Promise<JobListResult>;
  /**
   * Every job description with no `exportedAt`. This is what "export only what
   * is new" is built on.
   *
   * Quarantined records come back unfiltered: their `exportedAt` cannot be
   * read, so excluding them would be a guess, and it would hide them from the
   * one view most likely to be looked at.
   */
  listUnexported(): Promise<JobListResult>;
  get(id: string): Promise<JobDescription | undefined>;
  /** Throws `QuotaExceededError` when the write would not fit. */
  put(job: JobDescription): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Sets `exportedAt` and nothing else, by reading the current record first.
   * Taking a whole `JobDescription` instead would let an export — which holds
   * no opinion about title, text, or anything else — clobber an edit made
   * between capture and export.
   */
  markExported(id: string, exportedAt: string): Promise<StampResult>;
  /** Removes `exportedAt` and nothing else, returning the JD to "not exported". */
  clearExported(id: string): Promise<StampResult>;
  getUsage(): Promise<StorageUsage>;
}
