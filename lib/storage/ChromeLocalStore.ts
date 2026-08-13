import { browser } from 'wxt/browser';
import { parseJobDescription } from '../models/parse.js';
import type { JobDescription, QuarantinedRecord } from '../models/types.js';
import {
  JOB_DESCRIPTION_KEY_PREFIX,
  LOCAL_QUOTA_BYTES,
  jobDescriptionKey,
  type JobListResult,
  type LocalStore,
  type StampResult,
} from './LocalStore.js';
import { QuotaExceededError, type StorageUsage } from './SyncProvider.js';

/**
 * Narrower than the sync provider's equivalent on purpose. `chrome.storage.local`
 * has no per-item cap, no item count, and no write-rate limit, so `QUOTA_BYTES`
 * is the only limit it can report — and the browser may raise it either as a
 * plain error naming the quota or as a `QuotaExceededError` DOMException whose
 * message says nothing useful.
 */
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message))
  );
}

/**
 * `chrome.storage.local` implementation of {@link LocalStore}.
 *
 * **One item per job description, keyed `jd:<id>`.** A single array would mean
 * rewriting every captured description — tens of kilobytes of raw text apiece —
 * on every capture and every export stamp.
 *
 * The namespace is shared: `RecruiterStore` parks sync overflow under
 * `overflow:r:`. Every read filters on the prefix rather than assuming the
 * namespace is ours alone.
 */
export class ChromeLocalStore implements LocalStore {
  async list(): Promise<JobListResult> {
    const stored = await browser.storage.local.get(null);

    const jobs: JobDescription[] = [];
    const quarantined: QuarantinedRecord[] = [];

    for (const [key, raw] of Object.entries(stored)) {
      // Recruiter overflow and anything else sharing this namespace are not our
      // business, and must not be reported as corrupt job descriptions.
      if (!key.startsWith(JOB_DESCRIPTION_KEY_PREFIX)) continue;

      const result = parseJobDescription(raw);

      if (result.ok) {
        jobs.push(result.value);
        continue;
      }

      // Kept rather than dropped. A captured description that failed validation
      // still represents work the user did, and omitting it would turn
      // corruption into a job that silently stopped existing.
      quarantined.push({
        key,
        raw,
        reason: result.reason,
        errors: result.errors,
        quarantinedAt: new Date().toISOString(),
      });
    }

    return { jobs, quarantined };
  }

  async get(id: string): Promise<JobDescription | undefined> {
    const key = jobDescriptionKey(id);
    const stored = await browser.storage.local.get(key);
    const raw = stored[key];

    if (raw === undefined) return undefined;

    const result = parseJobDescription(raw);
    return result.ok ? result.value : undefined;
  }

  async put(job: JobDescription): Promise<void> {
    try {
      await browser.storage.local.set({ [jobDescriptionKey(job.id)]: job });
    } catch (error) {
      if (!isQuotaError(error)) throw error;

      // Usage is best-effort: if the read also fails, the quota error is still
      // the useful thing to report.
      const usage = await this.getUsage().catch(() => undefined);

      throw new QuotaExceededError(
        `Could not save "${job.title}" — local storage is full.`,
        usage,
        { cause: error },
      );
    }
  }

  async remove(id: string): Promise<void> {
    await browser.storage.local.remove(jobDescriptionKey(id));
  }

  async markExported(id: string, exportedAt: string): Promise<StampResult> {
    return this.#restamp(id, (job) => ({ ...job, exportedAt }));
  }

  async clearExported(id: string): Promise<StampResult> {
    // Destructured out rather than set to undefined. "Not yet exported" is
    // expressed by the key's absence, and an explicit undefined would survive
    // storage in some engines and read as exported to a key check.
    return this.#restamp(id, ({ exportedAt: _cleared, ...rest }) => rest);
  }

  /**
   * Read, validate, apply, validate again, write.
   *
   * The second validation is not belt-and-braces: it is what stops a bad
   * timestamp from being written and only surfacing as a quarantined read
   * weeks later, by which point the export that caused it is unrecoverable
   * context.
   */
  async #restamp(
    id: string,
    update: (job: JobDescription) => JobDescription,
  ): Promise<StampResult> {
    const key = jobDescriptionKey(id);
    const stored = await browser.storage.local.get(key);
    const raw = stored[key];

    if (raw === undefined) {
      return {
        ok: false,
        reason: 'not-found',
        errors: [`no job description is stored under id ${id}`],
      };
    }

    const current = parseJobDescription(raw);

    // Refused, not repaired. A record from a newer build carries fields this
    // version cannot see, and writing back what the parser understood would
    // delete them.
    if (!current.ok) return { ok: false, reason: 'unreadable', errors: current.errors };

    const candidate = parseJobDescription(update(current.value));
    if (!candidate.ok) return { ok: false, reason: 'invalid-update', errors: candidate.errors };

    await this.put(candidate.value);

    return { ok: true, job: candidate.value };
  }

  async getUsage(): Promise<StorageUsage> {
    // The whole namespace, not just `jd:` keys. The 10MB cap applies to
    // everything stored locally, so measuring our own slice would under-report
    // and the warning would fire too late to be useful.
    const used = await browser.storage.local.getBytesInUse(null);

    return {
      used,
      quota: LOCAL_QUOTA_BYTES,
      fraction: used / LOCAL_QUOTA_BYTES,
    };
  }
}
