import type { QuarantinedRecord, Recruiter } from '../models/types.js';

/**
 * `chrome.storage.sync` limits, as documented by Chrome. Kept here rather than
 * inline so the quota meter and the provider cannot drift apart.
 *
 * The two ceilings are independent, and the byte cap binds first by a wide
 * margin: a recruiter with a full 300-character note runs roughly 750 bytes, so
 * the real capacity is nearer 150 records than 512.
 */
export const SYNC_QUOTA_BYTES = 102_400;
export const SYNC_QUOTA_BYTES_PER_ITEM = 8_192;
export const SYNC_MAX_ITEMS = 512;

/** Every recruiter is its own item. See `ChromeSyncProvider` for why. */
export const RECRUITER_KEY_PREFIX = 'r:';

export function recruiterKey(id: string): string {
  return `${RECRUITER_KEY_PREFIX}${id}`;
}

export interface StorageUsage {
  used: number;
  quota: number;
  /** 0–1. The options page warns at 0.8. */
  fraction: number;
}

/**
 * Reading returns survivors *and* casualties. Callers need both: a record that
 * failed validation is a diagnosable problem, and silently omitting it would
 * turn data corruption into data disappearance.
 */
export interface ListResult {
  recruiters: Recruiter[];
  quarantined: QuarantinedRecord[];
}

/**
 * The swap seam.
 *
 * v1 stores recruiters in `chrome.storage.sync` because it is free, needs no
 * backend, and holds more records than a single job search produces. When that
 * stops being true — 80% of quota, or external users needing cross-device sync
 * — a different implementation of this interface replaces it, and nothing above
 * this line changes.
 */
export interface SyncProvider {
  list(): Promise<ListResult>;
  get(id: string): Promise<Recruiter | undefined>;
  /** Throws `QuotaExceededError` when the write would not fit. */
  put(recruiter: Recruiter): Promise<void>;
  remove(id: string): Promise<void>;
  getUsage(): Promise<StorageUsage>;
}

/**
 * Raised instead of letting the underlying rejection escape, so callers can
 * distinguish "storage is full" — which has a real remedy — from an arbitrary
 * failure. Swallowing this would mean a save that silently did nothing.
 */
export class QuotaExceededError extends Error {
  readonly usage: StorageUsage | undefined;

  constructor(message: string, usage?: StorageUsage, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QuotaExceededError';
    this.usage = usage;
  }
}
