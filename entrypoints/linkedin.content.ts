import { browser } from 'wxt/browser';
import { extractProfile } from '../lib/extractors/profile.js';
import {
  HOST_ID,
  MOUNTED_PATH_ATTRIBUTE,
  mountProfileSaveUi,
} from '../lib/linkedin/profileSaveUi.js';
import { recruiterClient } from '../lib/messaging/client.js';
import type { ExtractRequest } from '../lib/messaging/activeTab.js';
import { HOST_ATTRIBUTE, unmountShadowHost } from '../lib/ui/shadowMount.js';
import { watchNavigation } from '../lib/ui/watchNavigation.js';

const PROFILE_PATH = /^\/in\//;

/**
 * How often to re-check that the page and the button still agree.
 *
 * A safety net, not the mechanism. Navigation events do the real work; this
 * catches the cases they cannot: LinkedIn re-rendering the action bar and
 * discarding our host without any navigation at all.
 *
 * One `querySelector` at this interval is cheaper than a subtree
 * MutationObserver on a page as busy as LinkedIn, and the check exits
 * immediately when nothing needs doing.
 */
const RECONCILE_MS = 1500;

export default defineContentScript({
  matches: ['*://*.linkedin.com/*'],

  main() {
    // A marker so "the script never ran" and "the script ran but did not mount"
    // can be told apart from the console. Reloading the extension does not
    // re-inject content scripts into tabs that are already open, and that
    // single fact has now cost two rounds of diagnosis.
    document.documentElement.setAttribute(
      'data-sourcebook',
      browser.runtime.getManifest().version,
    );

    let inFlight: AbortController | undefined;

    /**
     * Brings the page in line with what should be showing.
     *
     * Written as a reconcile rather than a navigation handler on purpose. The
     * previous version reacted to `history.pushState`, and LinkedIn's router
     * holds its own reference to that function captured before this script
     * runs — so clicking from one profile to another produced no event, no
     * mount, and no button at all. Comparing desired state against actual
     * state cannot miss an event, because it does not depend on one.
     */
    const reconcile = () => {
      const host = document.querySelector<HTMLElement>(
        `[${HOST_ATTRIBUTE}="${HOST_ID}"]`,
      );

      if (!PROFILE_PATH.test(location.pathname)) {
        inFlight?.abort();
        unmountShadowHost(HOST_ID);
        return;
      }

      const alreadyCorrect =
        host?.isConnected && host.getAttribute(MOUNTED_PATH_ATTRIBUTE) === location.pathname;
      if (alreadyCorrect) return;

      // Abandon any mount still waiting on the previous profile: it would
      // otherwise resolve later and render the wrong person's details.
      inFlight?.abort();
      unmountShadowHost(HOST_ID);

      const controller = new AbortController();
      inFlight = controller;

      void mountProfileSaveUi({ client: recruiterClient, signal: controller.signal });
    };

    reconcile();
    watchNavigation(reconcile);
    setInterval(reconcile, RECONCILE_MS);

    // The side panel's save button asks us to extract, because the DOM is here
    // and not there. Sharing the extractor rather than duplicating it is what
    // keeps the two surfaces from drifting apart.
    browser.runtime.onMessage.addListener((message) => {
      if ((message as ExtractRequest)?.type !== 'profile:extract') return;
      return Promise.resolve(extractProfile(document));
    });
  },
});
