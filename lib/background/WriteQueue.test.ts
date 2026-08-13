import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteQueue } from './WriteQueue.js';

/** Chrome names the limit in the message; there is no error code to match on. */
function rateLimitError() {
  return new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
}

describe('WriteQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs a single operation and returns its value', async () => {
    const queue = new WriteQueue();

    await expect(queue.run(async () => 'done')).resolves.toBe('done');
  });

  it('serialises operations rather than running them concurrently', async () => {
    const queue = new WriteQueue();
    const order: string[] = [];

    const first = queue.run(async () => {
      order.push('first-start');
      await new Promise((r) => setTimeout(r, 50));
      order.push('first-end');
    });
    const second = queue.run(async () => {
      order.push('second-start');
    });

    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);

    // Two writers racing on a quota that is genuinely reachable is a bug that
    // only shows up under load, which is the worst time to discover it.
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('keeps running later operations after an earlier one rejects', async () => {
    const queue = new WriteQueue();

    const failing = queue.run(async () => {
      throw new Error('unrelated failure');
    });
    const following = queue.run(async () => 'still ran');

    await expect(failing).rejects.toThrow('unrelated failure');
    await vi.advanceTimersByTimeAsync(0);
    await expect(following).resolves.toBe('still ran');
  });

  it('retries a rate-limited write and eventually succeeds', async () => {
    const queue = new WriteQueue({ baseDelayMs: 100 });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue('succeeded');

    const pending = queue.run(operation);
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toBe('succeeded');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially between retries', async () => {
    const queue = new WriteQueue({ baseDelayMs: 100, maxRetries: 3 });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue('succeeded');

    const pending = queue.run(operation);

    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);

    // 100 then 200: retrying at a fixed interval against a per-minute limit
    // just burns the same budget in a tighter loop.
    await vi.advanceTimersByTimeAsync(199);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe('succeeded');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retry limit and surfaces the last error', async () => {
    const queue = new WriteQueue({ baseDelayMs: 10, maxRetries: 2 });
    const operation = vi.fn().mockRejectedValue(rateLimitError());

    const pending = queue.run(operation);
    const assertion = expect(pending).rejects.toThrow(/MAX_WRITE_OPERATIONS/);

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    // Initial attempt plus two retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors that are not rate limits', async () => {
    const queue = new WriteQueue({ baseDelayMs: 10 });
    const operation = vi.fn().mockRejectedValue(new Error('malformed record'));

    const pending = queue.run(operation);
    const assertion = expect(pending).rejects.toThrow('malformed record');

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    // Retrying a deterministic failure just delays the report of it.
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
