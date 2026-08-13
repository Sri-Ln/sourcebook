import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForElement } from './waitForElement.js';

describe('waitForElement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the element already exists', async () => {
    document.body.innerHTML = '<div class="anchor"></div>';

    await expect(waitForElement('.anchor')).resolves.toBe(
      document.querySelector('.anchor'),
    );
  });

  it('resolves when the element appears later', async () => {
    const pending = waitForElement('.anchor');

    // LinkedIn renders the action bar well after the content script runs.
    document.body.innerHTML = '<div class="anchor"></div>';
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toBeInstanceOf(HTMLElement);
  });

  it('finds an element added deep inside an existing subtree', async () => {
    document.body.innerHTML = '<main><section></section></main>';
    const pending = waitForElement('.anchor');

    const anchor = document.createElement('div');
    anchor.className = 'anchor';
    document.querySelector('section')!.append(anchor);
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toBe(anchor);
  });

  it('resolves null after the timeout rather than waiting forever', async () => {
    const pending = waitForElement('.never-appears', { timeoutMs: 10_000 });

    await vi.advanceTimersByTimeAsync(10_000);

    // Null, not a rejection. A missing anchor is an ordinary outcome on a page
    // LinkedIn has redesigned, not an exception worth surfacing to the user.
    await expect(pending).resolves.toBeNull();
  });

  it('defaults to a 10 second bound', async () => {
    const pending = waitForElement('.never-appears');

    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
  });

  it('never creates an observer when the element is already present', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    document.body.innerHTML = '<div class="anchor"></div>';

    await waitForElement('.anchor');

    expect(observe).not.toHaveBeenCalled();
  });

  it('disconnects the observer once the element appears', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const pending = waitForElement('.anchor');

    document.body.innerHTML = '<div class="anchor"></div>';
    await vi.advanceTimersByTimeAsync(0);
    await pending;

    // On a page that never reloads, an observer outliving its purpose is a
    // permanent subscription to every mutation on a very busy application.
    expect(disconnect).toHaveBeenCalled();
  });

  it('disconnects the observer when it times out', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const pending = waitForElement('.never-appears', { timeoutMs: 10_000 });

    await vi.advanceTimersByTimeAsync(10_000);
    await pending;

    expect(disconnect).toHaveBeenCalled();
  });

  it('resolves null immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForElement('.anchor', { signal: controller.signal }),
    ).resolves.toBeNull();
  });

  it('resolves null when aborted mid-wait', async () => {
    const controller = new AbortController();
    const pending = waitForElement('.anchor', { signal: controller.signal });

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    // Abort is how a soft navigation cancels the previous page's wait.
    await expect(pending).resolves.toBeNull();
  });
});
