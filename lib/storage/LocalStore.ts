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
 * The swap seam for job descriptions, mirroring `SyncProvider`.
 *
 * Separate from `SyncProvider` rather than a second implementation of it
 * because the two namespaces have genuinely different shapes: local storage has
 * no per-item cap and no write-rate limit, and job descriptions carry an
 * `exportedAt` lifecycle that recruiters have no equivalent of.
 */
export interface LocalStore {
  list(): Promise<JobListResult>;
  get(id: string): Promise<JobDescription | undefined>;
  /** Throws `QuotaExceededError` when the write would not fit. */
  put(job: JobDescription): Promise<void>;
  remove(id: string): Promise<void>;
  getUsage(): Promise<StorageUsage>;
}
