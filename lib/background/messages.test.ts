import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '../models/types.js';
import { ChromeSyncProvider } from '../storage/ChromeSyncProvider.js';
import { RecruiterStore } from './RecruiterStore.js';
import { handleMessage } from './messages.js';

const jane = {
  id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
  schemaVersion: SCHEMA_VERSION,
  name: 'Jane Placeholder',
  profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
  outreach: 'not-contacted' as const,
  source: { type: 'profile' as const },
  tags: [],
  savedAt: '2026-08-12T10:00:00.000Z',
  updatedAt: '2026-08-12T10:00:00.000Z',
};

describe('handleMessage', () => {
  let store: RecruiterStore;

  beforeEach(() => {
    fakeBrowser.reset();
    store = new RecruiterStore(new ChromeSyncProvider());
  });

  it('saves and then lists a recruiter', async () => {
    const saved = await handleMessage(store, { type: 'recruiter:save', recruiter: jane });
    expect(saved).toMatchObject({ ok: true });

    const listed = await handleMessage(store, { type: 'recruiter:list' });
    expect(listed).toMatchObject({ ok: true });
    if (listed.ok && 'recruiters' in listed) expect(listed.recruiters).toHaveLength(1);
  });

  it('gets a single recruiter', async () => {
    await handleMessage(store, { type: 'recruiter:save', recruiter: jane });

    const got = await handleMessage(store, { type: 'recruiter:get', id: jane.id });
    expect(got).toMatchObject({ ok: true, recruiter: { name: 'Jane Placeholder' } });
  });

  it('removes a recruiter', async () => {
    await handleMessage(store, { type: 'recruiter:save', recruiter: jane });
    await handleMessage(store, { type: 'recruiter:remove', id: jane.id });

    const listed = await handleMessage(store, { type: 'recruiter:list' });
    if (listed.ok && 'recruiters' in listed) expect(listed.recruiters).toEqual([]);
  });

  it('reports validation failure without throwing across the message boundary', async () => {
    const result = await handleMessage(store, {
      type: 'recruiter:save',
      recruiter: { id: 'bad', name: 42 },
    });

    // An exception here would surface in the caller as an opaque
    // "message port closed" with no clue what was wrong.
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects an unknown message type instead of failing silently', async () => {
    const result = await handleMessage(store, { type: 'nonsense' } as never);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/nonsense/);
  });

  it('converts an unexpected failure into a response rather than a rejection', async () => {
    vi.spyOn(store, 'list').mockRejectedValue(new Error('storage exploded'));

    const result = await handleMessage(store, { type: 'recruiter:list' });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/storage exploded/);
  });

  it('answers a usage request for the quota meter', async () => {
    vi.spyOn(store, 'getUsage').mockResolvedValue({
      used: 81_920,
      quota: 102_400,
      fraction: 0.8,
    });

    const result = await handleMessage(store, { type: 'storage:usage' });
    expect(result).toMatchObject({ ok: true, usage: { fraction: 0.8 } });
  });

  describe('import', () => {
    it('imports records and answers with a summary', async () => {
      const result = await handleMessage(store, {
        type: 'data:import',
        recruiters: [jane],
      });

      expect(result).toMatchObject({ ok: true, summary: { imported: 1, skipped: 0 } });

      const listed = await handleMessage(store, { type: 'recruiter:list' });
      if (listed.ok && 'recruiters' in listed) expect(listed.recruiters).toHaveLength(1);
    });

    it('reports a rejected record in the summary rather than as a failure', async () => {
      // The batch partly succeeded. `ok: false` would discard the count of what
      // did get in, which is the number the user needs.
      const result = await handleMessage(store, {
        type: 'data:import',
        recruiters: [jane, { id: 'bad' }],
      });

      expect(result).toMatchObject({ ok: true, summary: { imported: 1, skipped: 1 } });
    });
  });

  describe('tag management', () => {
    beforeEach(async () => {
      await handleMessage(store, {
        type: 'recruiter:save',
        recruiter: { ...jane, tags: ['fintech'] },
      });
    });

    it('renames a tag and reports how many records changed', async () => {
      const result = await handleMessage(store, {
        type: 'tag:rename',
        from: 'fintech',
        to: 'finance',
      });

      expect(result).toMatchObject({ ok: true, changed: 1 });

      const got = await handleMessage(store, { type: 'recruiter:get', id: jane.id });
      expect(got).toMatchObject({ recruiter: { tags: ['finance'] } });
    });

    it('turns a blank rename into a reported failure, not a thrown one', async () => {
      const result = await handleMessage(store, { type: 'tag:rename', from: 'fintech', to: '' });

      expect(result).toMatchObject({ ok: false });
    });

    it('deletes a tag and reports how many records changed', async () => {
      const result = await handleMessage(store, { type: 'tag:remove', tag: 'fintech' });

      expect(result).toMatchObject({ ok: true, changed: 1 });

      const got = await handleMessage(store, { type: 'recruiter:get', id: jane.id });
      expect(got).toMatchObject({ recruiter: { tags: [] } });
    });
  });
});
