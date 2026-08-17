import { browser } from 'wxt/browser';
import { RECRUITER_KEY_PREFIX } from './SyncProvider.js';

/**
 * Calls `listener` whenever the saved set changes, anywhere.
 *
 * `storage.onChanged` fires in every extension context — side panel, options
 * page, and content scripts — which makes it the one signal all three surfaces
 * can agree on. The alternative, broadcasting from the background worker after
 * each write, means every surface has to be reachable at the moment of the
 * write; a content script in a backgrounded tab is not, and a side panel that
 * was closed during the write never hears it.
 *
 * Filtered to recruiter keys so unrelated writes to the same namespace do not
 * trigger a refetch. Returns an unsubscribe.
 */
export function watchRecruiters(listener: () => void): () => void {
  const onChanged = (changes: Record<string, unknown>) => {
    if (Object.keys(changes).some((key) => key.startsWith(RECRUITER_KEY_PREFIX))) {
      listener();
    }
  };

  browser.storage.sync.onChanged.addListener(onChanged);
  return () => browser.storage.sync.onChanged.removeListener(onChanged);
}
