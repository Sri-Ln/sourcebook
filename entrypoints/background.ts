export default defineBackground(() => {
  // This becomes the single writer for all storage (#8).
  //
  // Content scripts could write directly, but chrome.storage.sync enforces
  // 120 writes/minute and 1,800/hour — limits that are genuinely reachable.
  // Routing every write through here gives one place to batch, debounce, and
  // surface quota errors, and avoids two writers racing on the same quota.
});
