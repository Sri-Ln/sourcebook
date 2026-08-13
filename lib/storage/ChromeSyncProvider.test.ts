import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { ChromeSyncProvider } from './ChromeSyncProvider.js';
import { QuotaExceededError, SYNC_QUOTA_BYTES, recruiterKey } from './SyncProvider.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: ['fintech'],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('ChromeSyncProvider', () => {
  let provider: ChromeSyncProvider;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    provider = new ChromeSyncProvider();
  });

  describe('round trip', () => {
    it('stores and retrieves a recruiter', async () => {
      const jane = recruiter();
      await provider.put(jane);

      expect(await provider.get(jane.id)).toEqual(jane);
    });

    it('stores one item per recruiter rather than a single array', async () => {
      // A single array would exceed the 8,192-byte per-item cap at roughly
      // fifteen recruiters, and every save would rewrite the whole set against
      // the write-rate budget.
      await provider.put(recruiter({ id: 'aaa' }));
      await provider.put(recruiter({ id: 'bbb' }));

      const raw = await browser.storage.sync.get(null);
      expect(Object.keys(raw).sort()).toEqual([recruiterKey('aaa'), recruiterKey('bbb')]);
    });

    it('returns undefined for an unknown id rather than throwing', async () => {
      expect(await provider.get('nope')).toBeUndefined();
    });

    it('overwrites in place on a second put', async () => {
      await provider.put(recruiter({ name: 'Jane Placeholder' }));
      await provider.put(recruiter({ name: 'Jane Renamed' }));

      const { recruiters } = await provider.list();
      expect(recruiters).toHaveLength(1);
      expect(recruiters[0]?.name).toBe('Jane Renamed');
    });

    it('removes a recruiter', async () => {
      const jane = recruiter();
      await provider.put(jane);
      await provider.remove(jane.id);

      expect(await provider.get(jane.id)).toBeUndefined();
      expect((await provider.list()).recruiters).toEqual([]);
    });

    it('treats removing an absent record as a no-op', async () => {
      await expect(provider.remove('never-existed')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns every stored recruiter', async () => {
      await provider.put(recruiter({ id: 'aaa' }));
      await provider.put(recruiter({ id: 'bbb' }));

      const { recruiters } = await provider.list();
      expect(recruiters.map((r) => r.id).sort()).toEqual(['aaa', 'bbb']);
    });

    it('ignores keys that are not recruiters', async () => {
      await provider.put(recruiter({ id: 'aaa' }));
      await browser.storage.sync.set({ settings: { theme: 'dark' } });

      const { recruiters, quarantined } = await provider.list();
      expect(recruiters).toHaveLength(1);
      expect(quarantined).toEqual([]);
    });

    it('quarantines a malformed record instead of dropping it', async () => {
      await provider.put(recruiter({ id: 'good' }));
      await browser.storage.sync.set({ [recruiterKey('bad')]: { id: 'bad', name: 42 } });

      const { recruiters, quarantined } = await provider.list();

      expect(recruiters.map((r) => r.id)).toEqual(['good']);
      expect(quarantined).toHaveLength(1);
      expect(quarantined[0]?.key).toBe(recruiterKey('bad'));
      expect(quarantined[0]?.reason).toBe('invalid');
      // The original is retained: bad data should be diagnosable, not lost.
      expect(quarantined[0]?.raw).toEqual({ id: 'bad', name: 42 });
    });

    it('quarantines a record from a newer schema without repairing it', async () => {
      await browser.storage.sync.set({
        [recruiterKey('future')]: { ...recruiter({ id: 'future' }), schemaVersion: 99 },
      });

      const { quarantined } = await provider.list();
      expect(quarantined[0]?.reason).toBe('newer-schema');
    });

    it('returns empty results on empty storage', async () => {
      expect(await provider.list()).toEqual({ recruiters: [], quarantined: [] });
    });
  });

  describe('usage', () => {
    // fakeBrowser does not implement getBytesInUse, so it is stubbed here.
    // That is the right boundary anyway: counting bytes is Chrome's job, and
    // what this class actually contributes is the arithmetic against the quota.
    function stubBytesInUse(bytes: number) {
      // getBytesInUse is overloaded — a promise form returning Promise<number>
      // and a callback form returning void. vi.spyOn resolves to the last
      // overload, so the cast is what lets us mock the promise form the
      // provider actually calls. Production code binds to it correctly.
      return vi
        .spyOn(browser.storage.sync, 'getBytesInUse')
        .mockResolvedValue(bytes as never);
    }

    it('reports bytes used against the documented quota', async () => {
      stubBytesInUse(25_600);

      const usage = await provider.getUsage();

      expect(usage).toEqual({
        used: 25_600,
        quota: SYNC_QUOTA_BYTES,
        fraction: 0.25,
      });
    });

    it('reports zero usage on empty storage', async () => {
      stubBytesInUse(0);

      const usage = await provider.getUsage();
      expect(usage.used).toBe(0);
      expect(usage.fraction).toBe(0);
    });

    it('measures the whole namespace, not a single key', async () => {
      // Passing a key here would under-report and the 80% warning would never
      // fire, which is precisely the failure the meter exists to prevent.
      const spy = stubBytesInUse(1_024);

      await provider.getUsage();

      expect(spy).toHaveBeenCalledWith(null);
    });

    it('crosses the 80% warning threshold at the documented point', async () => {
      stubBytesInUse(SYNC_QUOTA_BYTES * 0.8);

      expect((await provider.getUsage()).fraction).toBeCloseTo(0.8, 10);
    });
  });

  describe('quota failures', () => {
    it('raises QuotaExceededError rather than letting the raw rejection escape', async () => {
      vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(
        new Error('QUOTA_BYTES quota exceeded'),
      );

      await expect(provider.put(recruiter())).rejects.toBeInstanceOf(QuotaExceededError);
    });

    it('preserves the underlying error as the cause', async () => {
      const underlying = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(underlying);

      await expect(provider.put(recruiter())).rejects.toMatchObject({ cause: underlying });
    });

    it('does not disguise unrelated failures as quota problems', async () => {
      // Swallowing this into QuotaExceededError would send the caller chasing
      // storage limits for a bug that has nothing to do with them.
      const underlying = new Error('network disconnected');
      vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(underlying);

      await expect(provider.put(recruiter())).rejects.toBe(underlying);
    });
  });
});
