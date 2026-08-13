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
});
