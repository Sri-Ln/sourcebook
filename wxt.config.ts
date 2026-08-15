import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  zip: {
    /**
     * AMO requires a sources archive for minified extensions, and WXT builds it
     * from the working tree — **not** from what git tracks. Raw LinkedIn
     * captures are gitignored but still present on disk, so without this they
     * are packaged into an archive that gets uploaded to Mozilla and attached
     * to public releases: real names, photos and member ids for people who
     * never agreed to any of it.
     *
     * `scripts/audit-manifest.mjs` fails the build if any survive, because a
     * comment is not a safeguard.
     */
    excludeSources: ['tests/fixtures/raw/**', '**/*.env', '.claude/**'],
  },

  manifest: ({ browser }) => ({
    name: 'sourcebook',
    description: 'Save LinkedIn recruiters and job descriptions from your browser.',

    // Deliberately minimal. `<all_urls>` is the single biggest driver of slow
    // store review and user distrust, and this list is far cheaper to keep
    // short now than to shrink later. `activeTab` exists for the popup's
    // "Save current page" fallback when in-page injection fails.
    permissions: ['storage', 'activeTab'],
    host_permissions: ['*://*.linkedin.com/*'],

    // Firefox-only, so Chrome's manifest stays free of keys it ignores.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              // Firefox derives no ID of its own, so this must be declared and
              // must never change. A different ID makes Firefox treat the
              // build as a different extension, orphaning the user's saved
              // recruiters and breaking the link to the AMO listing.
              id: 'sourcebook@sri-ln.github.io',

              // Required by AMO for new extensions since 2025-11-03. "none" is
              // the literal truth here: no telemetry, no network requests of
              // our own, nothing leaves the machine.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
