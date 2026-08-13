import { browser } from 'wxt/browser';
import { parseRecruiter } from '../models/parse.js';
import type { QuarantinedRecord, Recruiter } from '../models/types.js';
import {
  QuotaExceededError,
  RECRUITER_KEY_PREFIX,
  SYNC_QUOTA_BYTES,
  recruiterKey,
  type ListResult,
  type StorageUsage,
  type SyncProvider,
} from './SyncProvider.js';

/**
 * Chrome reports quota failures as plain errors whose message names the limit
 * — `QUOTA_BYTES`, `QUOTA_BYTES_PER_ITEM`, `MAX_ITEMS`, and the per-minute and
 * per-hour write rates. There is no error code to match on, so the message is
 * all there is.
 *
 * Matched narrowly on purpose. Treating every failure as a quota problem would
 * send the caller chasing storage limits for a bug that has nothing to do with
 * them.
 */
const QUOTA_ERROR = /quota|MAX_ITEMS|MAX_WRITE_OPERATIONS/i;

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && QUOTA_ERROR.test(error.message);
}

/**
 * `chrome.storage.sync` implementation of {@link SyncProvider}.
 *
 * **One item per recruiter, keyed `r:<id>`.** A single array holding every
 * record would exceed the 8,192-byte per-item cap at roughly fifteen
 * recruiters, and every save would rewrite the entire set — burning the
 * 120-writes-per-minute budget on data that did not change.
 */
export class ChromeSyncProvider implements SyncProvider {
  async list(): Promise<ListResult> {
    const stored = await browser.storage.sync.get(null);

    const recruiters: Recruiter[] = [];
    const quarantined: QuarantinedRecord[] = [];

    for (const [key, raw] of Object.entries(stored)) {
      // Settings and anything else sharing this namespace are not our business.
      if (!key.startsWith(RECRUITER_KEY_PREFIX)) continue;

      const result = parseRecruiter(raw);

      if (result.ok) {
        recruiters.push(result.value);
        continue;
      }

      // Kept rather than dropped. Omitting a record that failed validation
      // would turn corruption into disappearance, and the user would never
      // learn a saved recruiter had stopped existing.
      quarantined.push({
        key,
        raw,
        reason: result.reason,
        errors: result.errors,
        quarantinedAt: new Date().toISOString(),
      });
    }

    return { recruiters, quarantined };
  }

  async get(id: string): Promise<Recruiter | undefined> {
    const key = recruiterKey(id);
    const stored = await browser.storage.sync.get(key);
    const raw = stored[key];

    if (raw === undefined) return undefined;

    const result = parseRecruiter(raw);
    return result.ok ? result.value : undefined;
  }

  async put(recruiter: Recruiter): Promise<void> {
    try {
      await browser.storage.sync.set({ [recruiterKey(recruiter.id)]: recruiter });
    } catch (error) {
      if (!isQuotaError(error)) throw error;

      // Usage is best-effort: if the read also fails, the quota error is still
      // the useful thing to report.
      const usage = await this.getUsage().catch(() => undefined);

      throw new QuotaExceededError(
        `Could not save "${recruiter.name}" — sync storage is full.`,
        usage,
        { cause: error },
      );
    }
  }

  async remove(id: string): Promise<void> {
    await browser.storage.sync.remove(recruiterKey(id));
  }

  async getUsage(): Promise<StorageUsage> {
    const used = await browser.storage.sync.getBytesInUse(null);

    return {
      used,
      quota: SYNC_QUOTA_BYTES,
      fraction: used / SYNC_QUOTA_BYTES,
    };
  }
}
