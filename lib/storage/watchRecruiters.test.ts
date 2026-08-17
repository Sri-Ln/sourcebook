import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { watchRecruiters } from './watchRecruiters.js';

describe('watchRecruiters', () => {
  beforeEach(() => fakeBrowser.reset());

  it('fires when a recruiter is written', async () => {
    const listener = vi.fn();
    watchRecruiters(listener);

    await fakeBrowser.storage.sync.set({ 'r:abc': { name: 'Jane' } });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires when a recruiter is removed', async () => {
    await fakeBrowser.storage.sync.set({ 'r:abc': { name: 'Jane' } });
    const listener = vi.fn();
    watchRecruiters(listener);

    await fakeBrowser.storage.sync.remove('r:abc');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores writes to keys that are not recruiters', async () => {
    const listener = vi.fn();
    watchRecruiters(listener);

    await fakeBrowser.storage.sync.set({ 'settings:theme': 'dark' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops after unsubscribing', async () => {
    const listener = vi.fn();
    const stop = watchRecruiters(listener);

    stop();
    await fakeBrowser.storage.sync.set({ 'r:abc': { name: 'Jane' } });

    expect(listener).not.toHaveBeenCalled();
  });
});
