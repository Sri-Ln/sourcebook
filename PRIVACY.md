# Privacy policy

**Last updated:** 2026-08-13

sourcebook is a browser extension that saves LinkedIn recruiter profiles and job descriptions for your own reference.

## The short version

sourcebook has no server. There is no account, no telemetry, and no analytics. It makes no network requests of its own. Your saved data is stored by your browser, on your machine.

Nobody — including the developer — can see what you save.

## What is stored, and where

| Data | Where it lives |
|---|---|
| Saved recruiters — name, headline, company, profile URL, member ID, tags, notes, outreach status, where you found them | `chrome.storage.sync` |
| Saved job descriptions | `chrome.storage.local` |
| Your filter preferences | `chrome.storage.local` |

Both are browser storage APIs. The data sits in your browser profile on your own device.

## The one exception worth stating plainly

`chrome.storage.sync` is synchronised **by your browser**, not by us. If you are signed into Chrome with sync enabled, your browser will copy that data between your own signed-in devices, exactly as it does with your bookmarks and saved passwords. That transfer is between you and your browser vendor under their privacy policy, and sourcebook has no access to it and no part in it.

If you would rather that did not happen, turn off extension sync in your browser settings, or sign out. Your data then stays on one device.

We say this explicitly because "no data ever leaves your machine" would be a tidier sentence and a false one.

## What is not collected

- No analytics, telemetry, crash reporting, or usage statistics
- No advertising identifiers, and no advertising
- No personal information sent anywhere
- Nothing sold, shared, rented, or transferred to any third party — there is no mechanism by which it could be

## Permissions, and why each exists

| Permission | Why |
|---|---|
| `storage` | To save your recruiters and job descriptions in the browser |
| `activeTab` | So the side panel's save button can read the LinkedIn tab you are looking at, at the moment you click it |
| `*://*.linkedin.com/*` | To place a Save button on LinkedIn pages and read the profile you are viewing |
| `sidePanel` | To show your saved list in the browser's side panel. It reads and writes nothing on its own. |
| `alarms` | To wake once a day and check whether any follow-up you set has come due. |
| `notifications` | **Optional, and only requested if you turn reminders on.** Used to show a single daily notice when follow-ups are due. |

There is no `<all_urls>` access. sourcebook runs on LinkedIn and nowhere else.

## Reading LinkedIn pages

When you are on a LinkedIn profile, sourcebook reads the visible page to capture the person's name, headline, company, and profile link. This happens locally in your browser and only on LinkedIn pages.

It reads only the page you are actually looking at, and only saves when you click Save. It does not crawl, bulk-collect, or read pages in the background.

## Your data is yours

The options page will export everything you have saved as a JSON file, at any time, with no restriction. You can delete individual records, or remove the extension — uninstalling removes its browser storage.

## Children

sourcebook is a professional job-search tool and is not directed at children under 13.

## Changes

If this policy changes, the date at the top changes and the revision is visible in this file's history in the public repository.

## Contact

Questions or concerns: open an issue at <https://github.com/Sri-Ln/sourcebook/issues>.

For anything security-related, please follow [SECURITY.md](SECURITY.md) rather than filing a public issue.

## Not affiliated with LinkedIn

sourcebook is an independent tool. It is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation or Microsoft. "LinkedIn" is a trademark of LinkedIn Corporation, used here only to describe what the extension works with.
