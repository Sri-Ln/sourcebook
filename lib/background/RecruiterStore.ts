import { browser } from 'wxt/browser';
import { parseRecruiter } from '../models/parse.js';
import type { QuarantinedRecord, Recruiter } from '../models/types.js';
import {
  QuotaExceededError,
  type StorageUsage,
  type SyncProvider,
} from '../storage/SyncProvider.js';
import { removeTagFrom, renameTagIn } from './tags.js';
import { WriteQueue } from './WriteQueue.js';

/**
 * Where a record goes when sync storage is full. Local storage is measured in
 * megabytes rather than the sync namespace's 100KB, so it will comfortably hold
 * the overflow.
 */
export const OVERFLOW_KEY_PREFIX = 'overflow:r:';

export type SaveResult =
  | { ok: true; recruiter: Recruiter; overflowed: boolean; usage?: StorageUsage }
  | { ok: false; errors: string[] };

export interface ImportSummary {
  /** Records that reached storage — including any that only reached local. */
  imported: number;
  skipped: number;
  /** Of the imported, how many sync could not hold. */
  overflowed: number;
  errors: string[];
}

export interface StoreListResult {
  recruiters: Recruiter[];
  quarantined: QuarantinedRecord[];
  /** Records living only in local storage because sync was full. */
  overflowedIds: string[];
}

/**
 * The single writer.
 *
 * Content scripts could write to storage directly, but `chrome.storage.sync`
 * enforces 120 writes per minute and 1,800 per hour — limits a burst of saves
 * genuinely reaches. One writer means one place to serialise, retry, and decide
 * what happens when storage fills up.
 *
 * This layer owns *policy*; `SyncProvider` only reports what happened.
 */
export class RecruiterStore {
  readonly #sync: SyncProvider;
  readonly #queue: WriteQueue;

  constructor(sync: SyncProvider, queue: WriteQueue = new WriteQueue()) {
    this.#sync = sync;
    this.#queue = queue;
  }

  async list(): Promise<StoreListResult> {
    const [synced, overflow] = await Promise.all([this.#sync.list(), this.#readOverflow()]);

    const byId = new Map(synced.recruiters.map((r) => [r.id, r]));
    const overflowedIds: string[] = [];

    for (const record of overflow) {
      // A record the user saved must not disappear from the list because
      // storage happened to be full. That is the whole point of the overflow.
      if (!byId.has(record.id)) overflowedIds.push(record.id);
      byId.set(record.id, record);
    }

    return {
      recruiters: [...byId.values()],
      quarantined: synced.quarantined,
      overflowedIds,
    };
  }

  async get(id: string): Promise<Recruiter | undefined> {
    return (await this.#sync.get(id)) ?? (await this.#readOverflowRecord(id));
  }

  /**
   * Validates, then writes.
   *
   * Validation happens here so a malformed record never reaches storage, where
   * it would resurface later as a quarantined read with no idea of its origin.
   */
  async save(input: unknown): Promise<SaveResult> {
    const parsed = parseRecruiter(input);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const recruiter = parsed.value;

    try {
      await this.#queue.run(() => this.#sync.put(recruiter));
    } catch (error) {
      if (!(error instanceof QuotaExceededError)) throw error;

      await browser.storage.local.set({ [this.#overflowKey(recruiter.id)]: recruiter });

      // Reported as a success because the record is safe, but flagged, because
      // telling the user nothing would leave them believing it synced.
      return { ok: true, recruiter, overflowed: true, usage: error.usage };
    }

    // It fits in sync now, so any stale overflow copy is redundant and would
    // otherwise shadow the synced record on read.
    await browser.storage.local.remove(this.#overflowKey(recruiter.id));

    return { ok: true, recruiter, overflowed: false };
  }

  async remove(id: string): Promise<void> {
    await this.#queue.run(() => this.#sync.remove(id));
    await browser.storage.local.remove(this.#overflowKey(id));
  }

  async getUsage(): Promise<StorageUsage> {
    return this.#sync.getUsage();
  }

  /**
   * Writes a batch of records the options page has already dry-run.
   *
   * Each goes through `save`, so each is validated here too. The options page
   * validating first is a courtesy to the user — it lets them see the count
   * before committing — but the single writer is the only place that can
   * actually guarantee an unvalidated record never reaches storage.
   *
   * One bad row does not abort the batch. Refusing an entire file because one
   * record is corrupt makes a partly damaged backup worthless, which is the
   * opposite of what an export is for.
   */
  async importRecruiters(records: readonly unknown[]): Promise<ImportSummary> {
    const summary: ImportSummary = { imported: 0, skipped: 0, overflowed: 0, errors: [] };

    for (const record of records) {
      const result = await this.save(record);

      if (!result.ok) {
        summary.skipped += 1;
        summary.errors.push(...result.errors);
        continue;
      }

      summary.imported += 1;
      if (result.overflowed) summary.overflowed += 1;
    }

    return summary;
  }

  /** Returns how many records changed. Throws if the new name is blank. */
  async renameTag(from: string, to: string): Promise<number> {
    if (to.trim() === '') {
      // Doing nothing quietly would be indistinguishable from a rename that
      // worked, and the user would go looking for a tag that never moved.
      throw new Error('A tag needs a name.');
    }

    return this.#rewriteTags((recruiter) => renameTagIn(recruiter, from, to));
  }

  /** Returns how many records changed. The records themselves are kept. */
  async removeTag(tag: string): Promise<number> {
    return this.#rewriteTags((recruiter) => removeTagFrom(recruiter, tag));
  }

  /**
   * Applies `change` to every record, writing only those it actually altered.
   *
   * The `null`-means-unchanged contract is what keeps this affordable: a rename
   * touching two records out of two hundred costs two writes, not two hundred
   * against a 120-per-minute budget.
   */
  async #rewriteTags(change: (recruiter: Recruiter) => Recruiter | null): Promise<number> {
    const { recruiters } = await this.list();

    let changed = 0;

    for (const recruiter of recruiters) {
      const updated = change(recruiter);
      if (!updated) continue;

      const result = await this.save(updated);
      if (result.ok) changed += 1;
    }

    return changed;
  }

  #overflowKey(id: string): string {
    return `${OVERFLOW_KEY_PREFIX}${id}`;
  }

  async #readOverflow(): Promise<Recruiter[]> {
    const stored = await browser.storage.local.get(null);

    return Object.entries(stored)
      .filter(([key]) => key.startsWith(OVERFLOW_KEY_PREFIX))
      .map(([, raw]) => parseRecruiter(raw))
      .flatMap((result) => (result.ok ? [result.value] : []));
  }

  async #readOverflowRecord(id: string): Promise<Recruiter | undefined> {
    const key = this.#overflowKey(id);
    const stored = await browser.storage.local.get(key);
    const parsed = parseRecruiter(stored[key]);

    return parsed.ok ? parsed.value : undefined;
  }
}
