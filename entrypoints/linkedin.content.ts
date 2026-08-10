export default defineContentScript({
  matches: ['*://*.linkedin.com/*'],

  main() {
    // Mounting the Save button lands in #9 and #11.
    //
    // Two mechanisms are required and neither is optional, because LinkedIn is
    // a single-page app: navigating profile to profile does not re-run this
    // script, and the action bar to inject into often does not exist yet when
    // it first runs. So: a URL-change watcher to re-mount on soft navigation,
    // and a bounded MutationObserver (10s) to wait for the anchor element.
    // Both behind an idempotent mount, so soft navigation cannot stack
    // duplicate buttons.
  },
});
