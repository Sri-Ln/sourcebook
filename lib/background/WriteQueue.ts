export interface WriteQueueOptions {
  /** First retry delay. Doubles each attempt. */
  baseDelayMs?: number;
  /** Retries after the initial attempt. */
  maxRetries?: number;
}

/**
 * Chrome reports write-rate failures by naming the limit in the message. There
 * is no error code, so the message is all there is to match on.
 *
 * Matched narrowly: retrying a deterministic failure — a malformed record, say
 * — just delays the report of it while looking like a hang.
 */
const RATE_LIMIT_ERROR = /MAX_WRITE_OPERATIONS|MAX_SUSTAINED_WRITE_OPERATIONS/i;

function isRateLimited(error: unknown): boolean {
  return error instanceof Error && RATE_LIMIT_ERROR.test(error.message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serialises storage writes and retries the ones Chrome rate-limits.
 *
 * `chrome.storage.sync` allows 120 writes per minute and 1,800 per hour —
 * limits a burst of saves can genuinely reach. Serialising gives one place to
 * absorb that, and means two callers can never race on the same quota.
 */
export class WriteQueue {
  readonly #baseDelayMs: number;
  readonly #maxRetries: number;

  /** The tail of the chain. Each new operation appends to it. */
  #tail: Promise<unknown> = Promise.resolve();

  constructor({ baseDelayMs = 500, maxRetries = 3 }: WriteQueueOptions = {}) {
    this.#baseDelayMs = baseDelayMs;
    this.#maxRetries = maxRetries;
  }

  /**
   * Queues `operation`, resolving with its result.
   *
   * A rejection is reported to *its own* caller and does not break the chain:
   * one bad record must not stop every later save.
   */
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(
      () => this.#withRetries(operation),
      () => this.#withRetries(operation),
    );

    // Swallowed only for the chain's own bookkeeping — the caller still sees
    // the rejection through `result`.
    this.#tail = result.catch(() => undefined);

    return result;
  }

  async #withRetries<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isRateLimited(error)) throw error;

        lastError = error;

        // Exponential, because retrying at a fixed interval against a
        // per-minute limit burns the same budget in a tighter loop.
        if (attempt < this.#maxRetries) {
          await sleep(this.#baseDelayMs * 2 ** attempt);
        }
      }
    }

    throw lastError;
  }
}
