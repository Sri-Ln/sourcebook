type HistoryMethod = 'pushState' | 'replaceState';

/**
 * Calls `onChange` whenever the URL changes without a page load.
 *
 * LinkedIn is a single-page app: clicking from one profile to the next swaps
 * the document contents in place. The content script runs **once**, on first
 * arrival, and never again. Without this, a Save button either disappears on
 * the second profile or — worse — stays put still holding the first person's
 * details and saves the wrong human.
 *
 * `history.pushState` fires no event of its own, so the methods are wrapped.
 * `popstate` covers back and forward, which do fire.
 *
 * Returns a stop function that restores whatever it wrapped.
 */
export function watchUrlChanges(onChange: (url: string) => void): () => void {
  let lastUrl = location.href;

  const notifyIfChanged = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    onChange(location.href);
  };

  const patched: Array<{ name: HistoryMethod; original: History[HistoryMethod] }> = [];

  for (const name of ['pushState', 'replaceState'] as const) {
    const original = history[name];
    patched.push({ name, original });

    history[name] = function patchedHistoryMethod(
      this: History,
      ...args: Parameters<History[HistoryMethod]>
    ) {
      const result = original.apply(this, args);
      // After, not before: the caller navigated for a reason, and observers
      // should see the URL they actually landed on.
      notifyIfChanged();
      return result;
    };
  }

  window.addEventListener('popstate', notifyIfChanged);
  window.addEventListener('hashchange', notifyIfChanged);

  return () => {
    // Restore rather than delete. Another watcher may have wrapped these after
    // us, and assigning back what we found keeps the chain intact.
    for (const { name, original } of patched) history[name] = original;

    window.removeEventListener('popstate', notifyIfChanged);
    window.removeEventListener('hashchange', notifyIfChanged);
  };
}
