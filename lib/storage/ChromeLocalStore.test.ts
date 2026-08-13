import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { SCHEMA_VERSION, type JobDescription } from '../models/types.js';
import { ChromeLocalStore } from './ChromeLocalStore.js';
import { LOCAL_QUOTA_BYTES, jobDescriptionKey } from './LocalStore.js';
import { QuotaExceededError, SYNC_QUOTA_BYTES } from './SyncProvider.js';

function job(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    id: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9',
    schemaVersion: SCHEMA_VERSION,
    title: 'Staff Platform Engineer',
    company: 'Placeholder Systems',
    url: 'https://www.linkedin.com/jobs/view/1234567890/',
    rawText: 'We are looking for a Staff Platform Engineer to own our build tooling.',
    capturedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('ChromeLocalStore', () => {
  let store: ChromeLocalStore;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    store = new ChromeLocalStore();
  });

  describe('round trip', () => {
    it('stores and retrieves a job description', async () => {
      const platform = job();
      await store.put(platform);

      expect(await store.get(platform.id)).toEqual(platform);
    });

    it('stores one item per job description, keyed jd:<id>', async () => {
      await store.put(job({ id: 'aaa' }));
      await store.put(job({ id: 'bbb' }));

      const raw = await browser.storage.local.get(null);
      expect(Object.keys(raw).sort()).toEqual([jobDescriptionKey('aaa'), jobDescriptionKey('bbb')]);
    });

    it('holds raw text larger than the entire sync quota', async () => {
      // The reason this store exists at all. A single description this size
      // would not fit in `chrome.storage.sync` even if it were the only record.
      const enormous = job({ rawText: 'x'.repeat(SYNC_QUOTA_BYTES * 2) });
      await store.put(enormous);

      expect((await store.get(enormous.id))?.rawText).toHaveLength(SYNC_QUOTA_BYTES * 2);
    });

    it('returns undefined for an unknown id rather than throwing', async () => {
      expect(await store.get('nope')).toBeUndefined();
    });

    it('overwrites in place on a second put', async () => {
      await store.put(job({ title: 'Staff Platform Engineer' }));
      await store.put(job({ title: 'Principal Platform Engineer' }));

      const { jobs } = await store.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.title).toBe('Principal Platform Engineer');
    });

    it('removes a job description', async () => {
      const platform = job();
      await store.put(platform);
      await store.remove(platform.id);

      expect(await store.get(platform.id)).toBeUndefined();
      expect((await store.list()).jobs).toEqual([]);
    });

    it('treats removing an absent record as a no-op', async () => {
      await expect(store.remove('never-existed')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns every stored job description', async () => {
      await store.put(job({ id: 'aaa' }));
      await store.put(job({ id: 'bbb' }));

      const { jobs } = await store.list();
      expect(jobs.map((j) => j.id).sort()).toEqual(['aaa', 'bbb']);
    });

    it('ignores keys that are not job descriptions', async () => {
      // The local namespace is shared: `RecruiterStore` parks recruiters that
      // did not fit in sync under `overflow:r:`. Claiming those as job
      // descriptions would fill the export with garbage.
      await store.put(job({ id: 'aaa' }));
      await browser.storage.local.set({
        'overflow:r:zzz': { id: 'zzz', name: 'Jane Placeholder' },
        settings: { theme: 'dark' },
      });

      const { jobs, quarantined } = await store.list();
      expect(jobs).toHaveLength(1);
      expect(quarantined).toEqual([]);
    });

    it('quarantines a malformed record instead of dropping it', async () => {
      await store.put(job({ id: 'good' }));
      await browser.storage.local.set({ [jobDescriptionKey('bad')]: { id: 'bad', title: 42 } });

      const { jobs, quarantined } = await store.list();

      expect(jobs.map((j) => j.id)).toEqual(['good']);
      expect(quarantined).toHaveLength(1);
      expect(quarantined[0]?.key).toBe(jobDescriptionKey('bad'));
      expect(quarantined[0]?.reason).toBe('invalid');
      // The original is retained: bad data should be diagnosable, not lost.
      expect(quarantined[0]?.raw).toEqual({ id: 'bad', title: 42 });
    });

    it('quarantines a record from a newer schema without repairing it', async () => {
      await browser.storage.local.set({
        [jobDescriptionKey('future')]: { ...job({ id: 'future' }), schemaVersion: 99 },
      });

      const { quarantined } = await store.list();
      expect(quarantined[0]?.reason).toBe('newer-schema');
    });

    it('returns empty results on empty storage', async () => {
      expect(await store.list()).toEqual({ jobs: [], quarantined: [] });
    });
  });

  describe('usage', () => {
    // fakeBrowser does not implement getBytesInUse, so it is stubbed here.
    // Counting bytes is Chrome's job; what this class contributes is the
    // arithmetic against the quota.
    function stubBytesInUse(bytes: number) {
      // getBytesInUse is overloaded — a promise form returning Promise<number>
      // and a callback form returning void. vi.spyOn resolves to the last
      // overload, so the cast is what lets us mock the promise form the store
      // actually calls. Production code binds to it correctly.
      return vi.spyOn(browser.storage.local, 'getBytesInUse').mockResolvedValue(bytes as never);
    }

    it('reports bytes used against the documented quota', async () => {
      stubBytesInUse(LOCAL_QUOTA_BYTES / 4);

      expect(await store.getUsage()).toEqual({
        used: LOCAL_QUOTA_BYTES / 4,
        quota: LOCAL_QUOTA_BYTES,
        fraction: 0.25,
      });
    });

    it('measures the whole namespace, not a single key', async () => {
      // The 10MB cap applies to the namespace as a whole, which this extension
      // shares with recruiter overflow. Measuring only `jd:` keys would
      // under-report and the warning would never fire.
      const spy = stubBytesInUse(1_024);

      await store.getUsage();

      expect(spy).toHaveBeenCalledWith(null);
    });
  });

  describe('quota failures', () => {
    it('raises QuotaExceededError rather than letting the raw rejection escape', async () => {
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue(
        new Error('QUOTA_BYTES quota exceeded'),
      );

      await expect(store.put(job())).rejects.toBeInstanceOf(QuotaExceededError);
    });

    it('names the job description that could not be saved', async () => {
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue(new Error('quota exceeded'));

      await expect(store.put(job({ title: 'Staff Platform Engineer' }))).rejects.toThrow(
        /Staff Platform Engineer/,
      );
    });

    it('recognises the DOMException form, which carries the limit in its name', async () => {
      // Firefox and Chrome's storage layer both surface a DOMException whose
      // message says nothing useful; the name is the only signal.
      const domStyle = new Error('The operation failed');
      domStyle.name = 'QuotaExceededError';
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue(domStyle);

      await expect(store.put(job())).rejects.toBeInstanceOf(QuotaExceededError);
    });

    it('preserves the underlying error as the cause', async () => {
      const underlying = new Error('QUOTA_BYTES quota exceeded');
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue(underlying);

      await expect(store.put(job())).rejects.toMatchObject({ cause: underlying });
    });

    it('does not disguise unrelated failures as quota problems', async () => {
      // Swallowing this into QuotaExceededError would send the caller chasing
      // storage limits for a bug that has nothing to do with them.
      const underlying = new Error('extension context invalidated');
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue(underlying);

      await expect(store.put(job())).rejects.toBe(underlying);
    });
  });
});
