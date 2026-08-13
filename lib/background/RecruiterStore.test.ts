import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import {
  QuotaExceededError,
  type ListResult,
  type StorageUsage,
  type SyncProvider,
} from '../storage/SyncProvider.js';
import { OVERFLOW_KEY_PREFIX, RecruiterStore } from './RecruiterStore.js';
import { WriteQueue } from './WriteQueue.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

/** Stands in for chrome.storage.sync so quota and rate limits are controllable. */
class FakeSyncProvider implements SyncProvider {
  records = new Map<string, Recruiter>();
  putError: Error | undefined;
  putCalls = 0;

  async list(): Promise<ListResult> {
    return { recruiters: [...this.records.values()], quarantined: [] };
  }

  async get(id: string) {
    return this.records.get(id);
  }

  async put(record: Recruiter) {
    this.putCalls += 1;
    if (this.putError) throw this.putError;
    this.records.set(record.id, record);
  }

  async remove(id: string) {
    this.records.delete(id);
  }

  async getUsage(): Promise<StorageUsage> {
    return { used: 1_000, quota: 102_400, fraction: 1_000 / 102_400 };
  }
}

describe('RecruiterStore', () => {
  let sync: FakeSyncProvider;
  let store: RecruiterStore;

  beforeEach(() => {
    fakeBrowser.reset();
    sync = new FakeSyncProvider();
    store = new RecruiterStore(sync, new WriteQueue({ baseDelayMs: 1, maxRetries: 1 }));
  });

  describe('validation', () => {
    it('saves a valid record', async () => {
      const result = await store.save(recruiter());

      expect(result.ok).toBe(true);
      expect(sync.records.size).toBe(1);
    });

    it('rejects an invalid record without writing anything', async () => {
      const result = await store.save({ id: 'bad', name: 42 });

      expect(result.ok).toBe(false);
      // Validation happens here so a malformed record never reaches storage,
      // where it would later surface as a quarantined read.
      expect(sync.putCalls).toBe(0);
    });

    it('reports why validation failed', async () => {
      const result = await store.save({ id: 'bad', name: 42 });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a note longer than the cap rather than truncating it', async () => {
      const result = await store.save(recruiter({ note: 'x'.repeat(301) }));

      // Silently truncating would lose the user's words without telling them.
      expect(result.ok).toBe(false);
      expect(sync.putCalls).toBe(0);
    });
  });

  describe('quota exhaustion', () => {
    beforeEach(() => {
      sync.putError = new QuotaExceededError('sync storage is full');
    });

    it('keeps the record in local storage rather than losing it', async () => {
      const jane = recruiter();
      const result = await store.save(jane);

      const local = await browser.storage.local.get(null);
      expect(local[`${OVERFLOW_KEY_PREFIX}${jane.id}`]).toEqual(jane);
      expect(result.ok).toBe(true);
    });

    it('reports the overflow rather than pretending the save was normal', async () => {
      const result = await store.save(recruiter());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.overflowed).toBe(true);
    });

    it('still lists an overflowed record, flagged', async () => {
      const jane = recruiter({ id: 'overflowed' });
      await store.save(jane);

      const { recruiters, overflowedIds } = await store.list();

      // A record the user saved must not vanish from the list because storage
      // was full. That is the failure the overflow exists to prevent.
      expect(recruiters.map((r) => r.id)).toContain('overflowed');
      expect(overflowedIds).toEqual(['overflowed']);
    });

    it('clears the overflow copy once the record fits in sync again', async () => {
      const jane = recruiter();
      await store.save(jane);

      sync.putError = undefined;
      await store.save(jane);

      const local = await browser.storage.local.get(null);
      expect(local[`${OVERFLOW_KEY_PREFIX}${jane.id}`]).toBeUndefined();
      expect((await store.list()).overflowedIds).toEqual([]);
    });
  });

  describe('rate limits', () => {
    it('retries through a rate limit and succeeds', async () => {
      const put = vi.spyOn(sync, 'put');
      put.mockRejectedValueOnce(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded'));

      const result = await store.save(recruiter());

      expect(result.ok).toBe(true);
      expect(put).toHaveBeenCalledTimes(2);
    });
  });

  describe('reads and deletes', () => {
    it('lists synced records', async () => {
      await store.save(recruiter({ id: 'aaa' }));
      await store.save(recruiter({ id: 'bbb' }));

      expect((await store.list()).recruiters).toHaveLength(2);
    });

    it('removes from both sync and the overflow copy', async () => {
      const jane = recruiter();
      sync.putError = new QuotaExceededError('full');
      await store.save(jane);
      sync.putError = undefined;

      await store.remove(jane.id);

      const local = await browser.storage.local.get(null);
      expect(local[`${OVERFLOW_KEY_PREFIX}${jane.id}`]).toBeUndefined();
      expect((await store.list()).recruiters).toEqual([]);
    });

    it('exposes usage for the quota meter', async () => {
      expect((await store.getUsage()).quota).toBe(102_400);
    });
  });

  describe('import', () => {
    it('writes every valid record', async () => {
      const summary = await store.importRecruiters([
        recruiter({ id: 'aaa' }),
        recruiter({ id: 'bbb' }),
      ]);

      expect(summary.imported).toBe(2);
      expect((await store.list()).recruiters).toHaveLength(2);
    });

    it('imports the good records and reports the bad ones', async () => {
      // Refusing the whole file for one bad row would make a partly corrupt
      // backup worthless, which is the opposite of an escape route.
      const summary = await store.importRecruiters([recruiter({ id: 'good' }), { id: 'bad' }]);

      expect(summary.imported).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.errors.length).toBeGreaterThan(0);
    });

    it('validates on the way in rather than trusting the caller', async () => {
      // The options page validates too, but the store is the single writer and
      // is the only place that can actually guarantee this.
      const summary = await store.importRecruiters([{ id: 'bad', name: 42 }]);

      expect(summary.imported).toBe(0);
      expect(sync.putCalls).toBe(0);
    });

    it('reports records that only reached local storage', async () => {
      sync.putError = new QuotaExceededError('sync storage is full');

      const summary = await store.importRecruiters([recruiter({ id: 'aaa' })]);

      // Counted as imported — the record is safe — but flagged, because telling
      // the user "1 imported" would leave them believing it had synced.
      expect(summary.imported).toBe(1);
      expect(summary.overflowed).toBe(1);
    });

    it('does nothing for an empty file', async () => {
      const summary = await store.importRecruiters([]);

      expect(summary).toMatchObject({ imported: 0, skipped: 0 });
      expect(sync.putCalls).toBe(0);
    });
  });

  describe('tag management', () => {
    beforeEach(async () => {
      await store.save(recruiter({ id: 'aaa', tags: ['fintech', 'remote'] }));
      await store.save(recruiter({ id: 'bbb', tags: ['fintech'] }));
      await store.save(recruiter({ id: 'ccc', tags: ['other'] }));
      sync.putCalls = 0;
    });

    const tagsOf = async (id: string) => (await store.get(id))?.tags;

    it('renames a tag everywhere it appears', async () => {
      await store.renameTag('fintech', 'finance');

      expect(await tagsOf('aaa')).toEqual(['finance', 'remote']);
      expect(await tagsOf('bbb')).toEqual(['finance']);
    });

    it('reports how many records changed', async () => {
      expect(await store.renameTag('fintech', 'finance')).toBe(2);
    });

    it('writes only the records that changed', async () => {
      await store.renameTag('fintech', 'finance');

      // Rewriting all three would spend the 120-writes-per-minute budget on a
      // record whose tags did not move.
      expect(sync.putCalls).toBe(2);
      expect(await tagsOf('ccc')).toEqual(['other']);
    });

    it('writes nothing when no record carries the tag', async () => {
      expect(await store.renameTag('nonexistent', 'whatever')).toBe(0);
      expect(sync.putCalls).toBe(0);
    });

    it('refuses to rename a tag to nothing', async () => {
      // Silently doing nothing would look identical to a successful rename.
      await expect(store.renameTag('fintech', '   ')).rejects.toThrow(/name/i);
      expect(sync.putCalls).toBe(0);
    });

    it('deletes a tag from every record that carries it', async () => {
      expect(await store.removeTag('fintech')).toBe(2);

      expect(await tagsOf('aaa')).toEqual(['remote']);
      expect(await tagsOf('bbb')).toEqual([]);
      expect(await tagsOf('ccc')).toEqual(['other']);
    });

    it('deletes the tag without deleting the records carrying it', async () => {
      await store.removeTag('fintech');

      expect((await store.list()).recruiters).toHaveLength(3);
    });
  });
});
