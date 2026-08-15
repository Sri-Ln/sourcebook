import { browser } from 'wxt/browser';
import { RecruiterStore } from '../lib/background/RecruiterStore.js';
import { handleMessage, type Request } from '../lib/background/messages.js';
import { ChromeSyncProvider } from '../lib/storage/ChromeSyncProvider.js';

export default defineBackground(() => {
  // The single writer. Content scripts and the popup could reach storage
  // directly, but chrome.storage.sync enforces 120 writes per minute and 1,800
  // per hour — limits a burst of saves genuinely reaches. Routing everything
  // through here means one place to serialise, retry, and decide what happens
  // when storage fills up, and no two callers racing on the same quota.
  const store = new RecruiterStore(new ChromeSyncProvider());

  browser.runtime.onMessage.addListener((message) =>
    handleMessage(store, message as Request),
  );

  // Clicking the toolbar icon opens the side panel instead of a popup. The list
  // lives there because it stays open while you browse LinkedIn, which a popup
  // cannot: a popup closes the moment focus leaves it.
  //
  // Chrome-only. Firefox opens its sidebar from the toolbar natively, and the
  // API does not exist there, so this is guarded rather than assumed.
  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Nothing actionable: the panel is still reachable from the extension menu.
    });
});
