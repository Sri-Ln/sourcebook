# Changelog

Notable changes, newest first. Each released version has a matching [GitHub release](https://github.com/Sri-Ln/sourcebook/releases) carrying the packaged Chrome and Firefox builds.

This project follows [semantic versioning](https://semver.org/). Before 1.0 the minor version moves for features and the patch version for fixes; nothing is promised to be stable yet.

## Unreleased

## 0.1.0 — 2026-08-13

First tagged build. Complete recruiter-saving workflow; not yet submitted to any extension store.

### Added

- **Save a recruiter from their LinkedIn profile.** A Save button beside Message opens a panel prefilled by extraction, with every field editable. Records where you found them, a note capped at 300 characters, tags, and outreach status.
- **Save from the popup** when the in-page button cannot mount. Reads the active tab and reuses the same extractor, so a LinkedIn redesign costs one extra click rather than the whole feature.
- **Profile extraction** built against real captured markup. Semantics-first — a heading inside an `/in/` link, the document title, `profileUrn` for a stable member id — because LinkedIn's class names are build hashes that change on every deploy.
- **Browse, search and filter.** Search spans names, companies, and your own notes. Filter by outreach status or tag; never-contacted is one click. Filter state survives the popup closing.
- **Inline outreach status editing** from the list row, applied optimistically and reconciled if the write fails.
- **Options page** with a storage quota meter, JSON export and import with a dry-run count, and tag rename/delete across all records.
- **Job description storage and rolecraft export formatting.** Built and tested, but not yet wired to any capture surface.

### Storage

- Recruiters live in `chrome.storage.sync`, one item per record, behind a `SyncProvider` interface so the backend can be replaced without touching anything above it.
- All writes route through the background worker, which serialises them, retries rate limits with exponential backoff, and falls back to local storage when the sync quota is full — flagged as "Not synced" rather than silently claiming success.
- Records that fail validation are quarantined, never dropped.

### Privacy

- No server, no account, no telemetry, no network requests of its own.
- Permissions limited to `storage`, `activeTab`, and `*://*.linkedin.com/*`, enforced by an audit that runs in CI.
- [Privacy policy](PRIVACY.md) states plainly that `chrome.storage.sync` is synchronised by the browser, rather than making a tidier claim that would be false.

### Known gaps

- Not yet verified against live LinkedIn. Extraction is tested against three real captures, but LinkedIn's markup changes without notice.
- Job description capture is not implemented; the storage and formatter behind it are.
- Chrome only so far. Firefox builds in CI; Edge and Safari are untouched.
- Store screenshots not captured.
