import { browser } from 'wxt/browser';
import { extractProfile } from '../lib/extractors/profile.js';
import { HOST_ID, mountProfileSaveUi } from '../lib/linkedin/profileSaveUi.js';
import { recruiterClient } from '../lib/messaging/client.js';
import type { ExtractRequest } from '../lib/messaging/activeTab.js';
import { unmountShadowHost } from '../lib/ui/shadowMount.js';
import { watchUrlChanges } from '../lib/ui/watchUrlChanges.js';

const PROFILE_PATH = /^\/in\//;

export default defineContentScript({
  matches: ['*://*.linkedin.com/*'],

  main() {
    // Each navigation abandons the previous one. LinkedIn is a single-page app,
    // so a mount waiting on the last profile's action bar can otherwise resolve
    // after you have moved on — rendering the previous person's details under a
    // button that would then save the wrong human.
    let inFlight: AbortController | undefined;

    const sync = () => {
      inFlight?.abort();
      unmountShadowHost(HOST_ID);

      if (!PROFILE_PATH.test(location.pathname)) return;

      const controller = new AbortController();
      inFlight = controller;

      void mountProfileSaveUi({ client: recruiterClient, signal: controller.signal });
    };

    sync();
    watchUrlChanges(sync);

    // The popup's "Save current page" fallback asks us to extract, because the
    // DOM is here and not there. Sharing the extractor rather than duplicating
    // it is what keeps the two surfaces from drifting apart.
    browser.runtime.onMessage.addListener((message) => {
      if ((message as ExtractRequest)?.type !== 'profile:extract') return;
      return Promise.resolve(extractProfile(document));
    });
  },
});
