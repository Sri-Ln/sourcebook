import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'sourcebook',
    description: 'Save LinkedIn recruiters and job descriptions from your browser.',
    // Deliberately minimal. `<all_urls>` is the single biggest driver of slow
    // store review and user distrust, and this list is far cheaper to keep
    // short now than to shrink later. `activeTab` exists for the popup's
    // "Save current page" fallback when in-page injection fails.
    permissions: ['storage', 'activeTab'],
    host_permissions: ['*://*.linkedin.com/*'],
  },
});
