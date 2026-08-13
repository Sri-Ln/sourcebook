import { browser } from 'wxt/browser';
import type { ProfileDraft } from '../extractors/profile.js';

/** Asked of the content script already running in the tab. */
export interface ExtractRequest {
  type: 'profile:extract';
}

export type ActiveTabState =
  | { savable: true; tabId: number; url: string }
  | { savable: false; reason: string };

/**
 * A profile page, and only a profile page.
 *
 * Job pages and the feed are savable in principle but not by *this* extractor,
 * and offering a button that produces a blank form is worse than offering none.
 */
export function classifyUrl(url: string | undefined): ActiveTabState | { savable: false; reason: string } {
  if (!url) {
    return { savable: false, reason: 'Open a LinkedIn profile to save someone.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { savable: false, reason: 'Open a LinkedIn profile to save someone.' };
  }

  if (!/(^|\.)linkedin\.com$/.test(parsed.hostname)) {
    return { savable: false, reason: 'This only works on LinkedIn.' };
  }

  if (!/^\/in\//.test(parsed.pathname)) {
    return { savable: false, reason: 'Open someone’s profile page, then try again.' };
  }

  return { savable: true, tabId: -1, url };
}

/** What the popup can do with whatever tab is in front of the user. */
export async function inspectActiveTab(): Promise<ActiveTabState> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  const classified = classifyUrl(tab?.url);
  if (!classified.savable) return classified;

  if (typeof tab?.id !== 'number') {
    return { savable: false, reason: 'Could not identify the current tab.' };
  }

  return { savable: true, tabId: tab.id, url: classified.url };
}

/**
 * Asks the content script in `tabId` to run the extractor.
 *
 * The extraction happens in the tab rather than in the popup because that is
 * where the DOM is — and it reuses the same `extractProfile` the in-page button
 * uses, so the two surfaces can never drift apart.
 */
export async function requestDraft(tabId: number): Promise<ProfileDraft> {
  const request: ExtractRequest = { type: 'profile:extract' };
  const draft = (await browser.tabs.sendMessage(tabId, request)) as ProfileDraft | undefined;

  if (!draft) {
    // Usually means the content script has not been injected because the tab
    // predates the extension being installed or reloaded.
    throw new Error('Could not read the page. Try reloading the LinkedIn tab.');
  }

  return draft;
}
