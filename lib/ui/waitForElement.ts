export interface WaitForElementOptions {
  /**
   * How long to keep watching before giving up.
   *
   * A bound is required. LinkedIn redesigns, and an unbounded observer on a
   * page whose anchor will never appear is a permanent subscription to every
   * DOM mutation on a very busy application.
   */
  timeoutMs?: number;
  /** Cancels the wait — how a soft navigation abandons the previous page. */
  signal?: AbortSignal;
  /** Defaults to `document`. */
  root?: ParentNode;
}

export const DEFAULT_WAIT_MS = 10_000;

/**
 * Resolves with the first element matching `selector`, or `null` if it does not
 * appear before the timeout.
 *
 * Deliberately **not** a fixed `setTimeout` before querying: that is too slow
 * on a fast connection and still too early on a bad one. A MutationObserver
 * resolves the moment the element exists, whenever that turns out to be.
 *
 * Resolves `null` rather than rejecting. A missing anchor is an ordinary
 * outcome on a page LinkedIn has restructured — not an exception, and not
 * something to surface to the user.
 */
export function waitForElement(
  selector: string,
  { timeoutMs = DEFAULT_WAIT_MS, signal, root = document }: WaitForElementOptions = {},
): Promise<Element | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    let settled = false;

    // Every resource registers its own teardown as it is created, so no exit
    // path can forget one. An observer that outlives its purpose is a permanent
    // subscription to a very busy page that never reloads.
    const cleanups: Array<() => void> = [];

    const finish = (element: Element | null) => {
      if (settled) return;
      settled = true;

      for (const cleanup of cleanups) cleanup();
      resolve(element);
    };

    const existing = root.querySelector(selector);
    if (existing) {
      finish(existing);
      return;
    }

    if (signal) {
      const onAbort = () => finish(null);
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
    }

    const observer = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found) finish(found);
    });
    cleanups.push(() => observer.disconnect());

    // subtree, because LinkedIn mounts the action bar deep inside an existing
    // container rather than replacing the document.
    observer.observe(root instanceof Document ? root.documentElement : (root as Node), {
      childList: true,
      subtree: true,
    });

    const timer = setTimeout(() => finish(null), timeoutMs);
    cleanups.push(() => clearTimeout(timer));
  });
}
