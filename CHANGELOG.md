# Changelog

Notable changes, newest first. Each released version has a matching [GitHub release](https://github.com/Sri-Ln/sourcebook/releases) carrying the packaged Chrome and Firefox builds.

This project follows [semantic versioning](https://semver.org/). Before 1.0 the minor version moves for features and the patch version for fixes; nothing is promised to be stable yet.

## Unreleased

## 0.1.0 — 2026-08-15

First tagged build. Complete recruiter workflow; not yet submitted to any extension store.

### Saving

- **One click from a LinkedIn profile.** A Save button beside Message captures name, role, company and a stable member id, and stores it immediately — no form, no confirmation. Corrections happen later, from the list.
- **Save from the side panel** when the in-page button cannot mount, so a LinkedIn redesign costs one extra click rather than the whole feature.
- **Extraction is semantics-first**, built against real captured pages. LinkedIn ships build-hashed class names, no `<h1>`, and no structured data on an authenticated profile, so the extractor reads a heading inside an `/in/` link, the document title, `profileUrn`, and URL shapes — the things that survive a redesign.

### The side panel

- **Opens from the toolbar icon and stays open while you browse.** A popup closes the moment focus leaves it, which threw away the list on every click.
- **Grouped by company**, with a count per group. Company is the axis that matters: you look someone up because a role opened where they work.
- **Cards show a name and a role, nothing else.** A list you scan is only useful if there is little to read per row.
- **Search across everything**, including notes that are not shown on the card. Filter by outreach status, by tag, or to everyone never contacted. Filter state survives the panel closing.
- **Edit any saved person** — note, tags, company, headline, name, and where you found them. Identity fields are deliberately not editable.
- **Outreach status** changes from the row, applied immediately and reconciled if the write fails.

### Follow-ups

- Set a **follow-up date** on anyone; see Overdue, Today, or a countdown on their card, and filter to what is due.
- **One notification a day** covering everyone due — not one per person. Notifications are an optional permission requested on first use; the Due filter and badges work without it.

### Storage and privacy

- Recruiters live in `chrome.storage.sync`, one item per record, behind an interface that can be swapped for a backend later. Job descriptions and view preferences live in local storage.
- All writes go through the background worker, which serialises them, retries rate limits with backoff, and **falls back to local storage when sync fills up** — flagged as "Not synced" rather than silently claiming success.
- Records that fail validation are quarantined, never dropped.
- **Options page** with a real byte-based quota meter, JSON export and import with a dry run, and tag rename/delete.
- No server, no account, no telemetry. Permissions limited to `storage`, `activeTab`, `alarms`, `sidePanel`, and LinkedIn host access, enforced by an audit that runs in CI. [Privacy policy](PRIVACY.md).

### Also built, not yet wired up

Job description storage and the rolecraft export formatter are implemented and tested, but nothing captures a job description yet.

### Known gaps

- **Not yet verified against live LinkedIn** beyond manual spot checks. Extraction is tested against three real captures, but LinkedIn's markup changes without notice.
- Saving from a feed post is not implemented, so provenance defaults to "their profile" until corrected.
- Chrome only. Firefox builds in CI and the side panel maps to `sidebar_action`, but nothing has been run there. Edge and Safari untouched.
- No store screenshots, and no store submission.
