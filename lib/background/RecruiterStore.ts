import { browser } from 'wxt/browser';
import { parseRecruiter } from '../models/parse.js';
import type { QuarantinedRecord, Recruiter } from '../models/types.js';
import {
  QuotaExceededError,
  type StorageUsage,
  type SyncProvider,
} from '../storage/SyncProvider.js';
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
