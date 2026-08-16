/**
 * Reports SPA navigation, as reliably as the platform allows.
 *
 * Patching `history.pushState` is the usual trick and it is **not sufficient on
 * LinkedIn**: their router captures a reference to `pushState` when its bundle
 * initialises, which happens before a `document_idle` content script runs. It
 * then calls its own saved copy, so the patch never fires and a click-through
 * to another profile goes completely unnoticed.
 *
 * Three mechanisms, deliberately overlapping:
 *
 * 1. The **Navigation API**, when present. It is an event on the navigation
 *    itself rather than a hook on a function, so nothing can hold a reference
 *    around it. This is the one that actually fixes LinkedIn.
 * 2. `popstate` / `hashchange`, for back and forward.
 * 3. A patched `history`, which still helps in browsers without the Navigation
 *    API (Firefox today) and costs nothing where it is redundant.
 *
 * Callers are expected to be idempotent: several mechanisms may report the same
 * navigation, and the caller compares against its own last-known URL.
 */
export function watchNavigation(onChange: (url: string) => void): () => void {
  let lastUrl = location.href;

  const notify = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    onChange(location.href);
  };

  const cleanups: Array<() => void> = [];

  // 1. Navigation API.
  const navigation = (globalThis as { navigation?: EventTarget }).navigation;
  if (navigation) {
    // `navigatesuccess` rather than `navigate`: by then the URL has actually
    // changed, and reading location during `navigate` gives the old one.
    const onNavigate = () => notify();
    navigation.addEventListener('navigatesuccess', onNavigate);
    cleanups.push(() => navigation.removeEventListener('navigatesuccess', onNavigate));
  }

  // 2. History traversal.
  for (const event of ['popstate', 'hashchange'] as const) {
    window.addEventListener(event, notify);
    cleanups.push(() => window.removeEventListener(event, notify));
  }

  // 3. Patched history, for browsers without the Navigation API.
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = history[name];
    history[name] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
    // Restore rather than delete: another watcher may have wrapped after us.
    cleanups.push(() => {
      history[name] = original;
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
