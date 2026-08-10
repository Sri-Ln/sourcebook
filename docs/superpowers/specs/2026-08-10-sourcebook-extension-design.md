# sourcebook — design

**Date:** 2026-08-10
**Status:** Approved, pending implementation plan
**Repo:** `Sri-Ln/sourcebook` (public)

## Problem

Two recurring costs in an active job search:

1. **Lost contacts.** Recruiters and hiring managers surface while browsing a company's people or while reading someone else's post. They get saved inconsistently — or not at all — so when a relevant opening appears later, the contact has to be rediscovered from scratch.
2. **Manual JD transfer.** Good job descriptions need to reach [rolecraft](../../../../rolecraft), which uses them to derive concepts, tech stacks, and portfolio project suggestions. Today this means copy-pasting into a Word document.

The second problem has a structural cause worth stating: rolecraft's `process` mode accepts a URL, but **LinkedIn job pages sit behind an authentication wall and will not fetch server-side**. The URL path silently degrades to manual copy-paste. A browser extension runs inside the authenticated session and can reach text no server-side fetch can.

## Goals

- Save a recruiter from a LinkedIn profile in one click, with enough context to be useful months later.
- Save a LinkedIn job description and hand it to rolecraft in the format it already expects.
- Track outreach state so the saved list is actionable, not just an archive.
- Stay cheap to run and free to operate at v1 scale.

## Non-goals

- **Bulk harvesting.** Saving the profile currently on screen, on an explicit click, is a bookmark with metadata. Scraping search results in bulk violates LinkedIn's terms, risks the user's account, and gets extensions removed from the Chrome Web Store. The design deliberately supports only the former.
- **Automated outreach.** No message sending, no connection requests.
- **A backend, in v1.** No accounts, no server, no privacy policy obligations.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| v1 audience | Personal use; store submission is Phase 4 | Real usage data before committing to a backend. Local→cloud is a routine migration; cloud→local means shutting down a service users trusted. |
| Recruiter storage | `chrome.storage.sync` behind a `SyncProvider` interface | Free, zero infrastructure, no auth. The interface makes the ceiling a non-event. |
| JD storage | `chrome.storage.local` | A single JD's raw text can exceed the entire sync quota. |
| Save trigger | Injected in-page button | Lowest friction. The popup exists anyway for list management, so it doubles as the fallback surface when injection fails. |
| JD sources, v1 | LinkedIn Jobs only | ATS adapters deferred. Keeps v1 to one site and one selector set. |
| rolecraft handoff | Clipboard, in inbox format | Matches the documented contract exactly. Zero integration code. |
| Stack | WXT + TypeScript; React popup; vanilla Shadow DOM content script | WXT makes browser target a build flag. No framework shipped into LinkedIn's page. |

### Migration trigger

Move to a real backend when **either**: sync storage crosses 80% of quota, or there are external users needing cross-device sync. Not before. Written down here so it is settled rather than re-litigated.

## Architecture

```
entrypoints/
  content/linkedin.ts     detects page type, mounts Save button in Shadow DOM
  popup/                  React: list, search, filter, edit, export
  background.ts           single writer: validates, persists, manages quota
lib/
  extractors/
    profile.ts            LinkedIn profile → Recruiter draft
    job.ts                LinkedIn job → JobDescription draft
    strategies.ts         layered: structured data → DOM → manual
  storage/
    SyncProvider.ts       interface (the swap seam)
    ChromeSyncProvider.ts chrome.storage.sync implementation
    LocalStore.ts         chrome.storage.local, for JDs
  models/                 types, validation, schemaVersion
  export/rolecraft.ts     formats JDs into the inbox contract
  ui/shadowMount.ts       shared Shadow DOM helper
```

Boundaries are strict: extractors know only DOM→object, storage knows only persistence, the formatter knows only text shape. They do not import each other.

**All writes route through the background worker.** Content scripts could write directly, but `storage.sync` enforces 120 writes/minute and 1,800/hour. A single writer gives one place to batch, debounce, and surface quota errors, and avoids two writers racing on a quota that is actually reachable.

## Data model

```ts
type Recruiter = {
  id: string;                 // uuid
  schemaVersion: 1;
  name: string;
  profileUrl: string;
  memberId?: string;          // stable key when extractable
  headline?: string;
  company?: string;           // best-effort in v1; see backlog
  outreach: 'not-contacted' | 'messaged' | 'replied' | 'referred' | 'closed';
  source: { type: 'profile' | 'post' | 'search' | 'manual'; url?: string };
  tags: string[];
  note?: string;              // capped at 300 characters
  savedAt: string;            // ISO 8601
  updatedAt: string;
};

type JobDescription = {
  id: string;
  schemaVersion: 1;
  title: string;
  company: string;
  location?: string;
  compensation?: string;
  url: string;
  rawText: string;
  capturedAt: string;
  exportedAt?: string;        // drives "export only what is new"
};
```

`schemaVersion` ships from day one. It costs one field and is the only thing that makes later migrations possible. Storage backends are swappable; a schema that failed to capture something is not recoverable, because the context is gone from memory by the time it is needed.

`source` exists for the same reason. Six months on, "found her in a post about a platform hiring spree" is often more actionable than a job title — it signals she is actively recruiting and supplies a warm opener.

### Storage layout and quota

**One sync item per recruiter, keyed `r:<id>`** — not a single array. An array would exceed the 8,192-byte per-item cap at roughly 15 recruiters, and every save would rewrite the whole record set against the write-rate budget.

`storage.sync` has two independent ceilings: **512 items** and **102,400 total bytes**. The byte cap binds first, by a wide margin:

| Record contents | Approx. bytes | Recruiters before quota |
|---|---|---|
| Core fields, no note | ~250 | ~400 |
| Core + typical short note | ~400 | ~250 |
| Core + full 300-char note | ~750 | ~135 |

So the realistic ceiling is **150–250 recruiters**, not 512. Because that depends on note length, the design does not guess from a record count: the options page reads **`chrome.storage.sync.getBytesInUse()`** and warns at 80% of quota. That is also what drives the migration trigger above.

`note` is capped at 300 characters with a live counter in the editor. Spilling long notes to local storage was rejected — it would quietly break the sync promise, since the note would not follow the user to another machine. A visible limit beats an invisible failure.

## Capture flows

### LinkedIn is a single-page app

This is the primary source of bugs in LinkedIn extensions, so it is an architectural concern rather than an implementation detail. Navigating profile→profile does **not** re-run the content script, and the action bar to inject into frequently does not exist when the script first runs.

Two mechanisms are required:

- A **URL-change watcher** that re-mounts on soft navigation.
- A **bounded `MutationObserver`** that waits for the anchor element, rather than a fixed `setTimeout` — too slow on fast connections, still too early on bad ones. Bound is 10 seconds, after which the observer disconnects and the content script goes quiet.

Both wrapped in an **idempotent mount** that refuses to inject twice, so soft navigation cannot stack duplicate buttons.

### Recruiter capture

1. Runs on `linkedin.com/in/*`; mounts a Shadow DOM host near Connect/Message.
2. Button reflects state: if already saved — matched on `memberId`, else normalized `profileUrl` — it shows **Saved ✓** rather than offering a duplicate.
3. Click opens a panel in the same shadow root, prefilled with whatever extraction found. Every field editable.
4. Confirm → message to background → validate → write → button flips to saved.

**Popup fallback.** If the anchor never appears — LinkedIn redesign, or a profile layout variant — the popup offers **Save current page**, reading the active tab's URL and running the same extractor. This is why `activeTab` is in the permission set, and it is what makes the injected-button approach safe to depend on: the failure mode is one extra click, not a dead feature.

**Provenance limitation.** A profile page cannot report how the user arrived. If a recruiter is found through a post, the extension sees only a profile visit. Mitigation in v1: `source` is an editable dropdown with an optional URL field, defaulting to `profile`. Automatic post provenance is deferred (see backlog).

### JD capture

Two URL shapes, not one:

- `linkedin.com/jobs/view/*` — dedicated page.
- `/jobs/search/?currentJobId=…` — split pane where JDs swap in with no navigation at all. This is where the URL watcher is essential.

Extraction pulls title, company, location, posted compensation when present, and the full description text.

**To verify during implementation:** LinkedIn appears to clip long descriptions visually via CSS while the full text is already present in the DOM. If so, the "see more" click is unnecessary. This should be confirmed against a live page rather than assumed in either direction.

## Export contract

The popup's **Export to rolecraft** action gathers every JD with no `exportedAt` and joins them with `\n---NEW JOB---\n` — separator **between** entries, never trailing. Each entry:

```markdown
## Software Engineer, Platform — Stripe
Source: https://linkedin.com/jobs/view/4123456789
Captured: 2026-08-10
Location: San Francisco, CA (Hybrid)

<raw description text>
```

The header is safe: `process` parses company and title from the text body regardless, and since it archives the JD "as given," the header carries into `jd-archive.md` as useful context.

Then: copy via `navigator.clipboard.writeText()`, stamp `exportedAt`, and report *"3 JDs copied — paste into `user/data/inbox.md` and run `/rolecraft`."*

**Failure mode designed for:** a successful clipboard write does not prove a paste happened. If the clipboard is overwritten before the user reaches the file, an optimistic `exportedAt` would permanently hide those JDs from future exports. Therefore nothing is ever deleted or hidden — every row keeps a **Copy again** action, and the export view has an *include already-exported* toggle.

## Resilience

Guiding principle: **degrade, never block.** Every failure path ends with "you can still save it by hand." The extension must never cause data loss, and must never nag on a page where it cannot work.

| Failure | Response |
|---|---|
| Extraction fails (markup changed) | Panel opens with blank or partial fields for manual entry. The failing strategy is logged locally so selector rot is visible rather than mysterious. |
| Anchor element never appears | After a bounded retry window, give up **silently**. No error toast — an extension that shouts on every page load gets uninstalled. |
| Sync quota exceeded | Catch the quota error, write the record to local storage so nothing is lost, and state plainly what happened. The quota meter should make this unreachable in practice. |
| Write rate limit hit | Background debounces and queues with retry. The single-writer design is what makes this tractable. |
| Duplicate save | Dedupe on `memberId`, falling back to `profileUrl` normalized: lowercased, trailing slash and query string stripped. |
| Old or invalid record | Validate on read; `schemaVersion` drives migration; invalid records are **quarantined, not dropped**. |

## Testing

**1. Fixture-based extractor tests (Vitest).** Extractors are pure `HTML → object` functions tested against saved LinkedIn markup. This is the highest-value testing in the project: it is how selector rot gets caught. LinkedIn ships a redesign, the fixture is refreshed, and failing tests identify exactly what moved.

Fixture policy, decided at Phase 0:

- **Real captured HTML: local only, gitignored.** High fidelity, used for development and for diagnosing redesigns. Contains real people's names, headlines, and photo URLs — never committed to a public repo.
- **Scrubbed fixtures: committed.** Derived from real markup with every human detail replaced by placeholders. LinkedIn's nesting and mangled class names are preserved, so selectors are still tested against real-world structure. Hand-written HTML was rejected: it tests selectors against the author's own assumptions and can pass while real extraction fails.

**2. Pure-logic unit tests.** The rolecraft formatter (including separator placement), URL normalization, dedupe, quota estimation.

**3. Storage tests** against a fake `chrome.storage`, exercising `SyncProvider` — which also proves the swap seam works before it is needed.

**4. Playwright E2E on the popup.** Launch Chrome with the built extension; verify list rendering, filtering, and export output. **Live LinkedIn is deliberately excluded from CI**: it is flaky, it needs credentials, and automating a logged-in session is the behavior that gets accounts restricted. Extraction is already covered by fixtures.

**5. A written manual smoke checklist** against real LinkedIn before each release. Five lines, kept short because it is unavoidable.

Implementation follows test-driven development: failing test, then code.

## Permissions

```
storage, activeTab, host: *://*.linkedin.com/*
```

Deliberately minimal. No clipboard permission — `navigator.clipboard.writeText()` works from a popup, which has focus and a user gesture. No `<all_urls>`, the single biggest driver of slow store review and user distrust. This list is free to keep short now and expensive to shrink later.

## Git and GitHub workflow

- `main` protected: no direct pushes, PR required, CI must pass.
- **Merge commits only.** Squash and rebase merging disabled at the repo level so the button cannot do the wrong thing.
- **"Require linear history" must stay off** — it is incompatible with merge commits and would reject exactly the merges intended.
- **No required approval count.** GitHub does not permit approving one's own PR; on a solo repo an approval requirement would deadlock merging. Manual review is the gate, enforced by convention, and merge happens when the reviewer is satisfied.
- Branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `test/`. Conventional Commits throughout, keeping `release-please` available later.
- `CODEOWNERS` set to `* @Sri-Ln` so review is auto-requested.

```bash
gh api -X PATCH repos/Sri-Ln/sourcebook \
  -F allow_merge_commit=true \
  -F allow_squash_merge=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true
```

**Review loop:** branch → implement test-first → open PR with test evidence → **stop, never self-merge** → reviewer comments → each comment addressed as its own commit with a threaded reply → reviewer merges. Review feedback is verified technically rather than reflexively implemented; a comment that appears incorrect gets a reasoned response instead of a bad change.

**Commit authorship:** repo init, `README`, `LICENSE`, `.gitignore`, this spec, the WXT scaffold, and the CI workflow are authored solely by the repo owner, with no Claude co-author trailer. Annotations begin with the first feature branch.

## Phases

| Phase | Scope |
|---|---|
| **0** | Create repo, branch protection, WXT scaffold, TypeScript, CI, `.gitignore` fixture policy, hygiene files. Then file the backlog as issues. |
| **1** | Recruiter capture end to end: mount, extract, store, popup list. The core loop. |
| **2** | JD capture and rolecraft clipboard export. |
| **3** | Polish: search, filter, outreach status editing, quota meter, options page. |
| **4** | Store readiness: icons, listing copy, privacy policy, permission audit. |
| **5** | Cross-browser ports. |
| **6+** | Backlog below. |

The local working directory stays `chrome`; only the repo is named `sourcebook`. The mismatch is intentional and harmless — git does not care what the containing folder is called.

**This spec spans more work than one implementation plan should cover.** Each phase gets its own plan, written when the previous phase merges — Phase 0 and Phase 1 first, since they are the ones with enough detail settled to plan honestly. Later phases are scoped here to fix direction, not to be planned yet.

## Cross-browser (Phase 5)

The three targets are very different amounts of work:

- **Edge** — Chromium. Effectively the same package via Partner Center. Nearly free.
- **Firefox** — `wxt build -b firefox` covers most of it. Real differences: background runs as an event page rather than a service worker, `browser_specific_settings.gecko.id` is required, and AMO has its own review. Note that `storage.sync` syncs against a *Mozilla* account, a separate silo — recruiters saved in Chrome will not appear in Firefox. Moderate.
- **Safari** — the outlier. Requires macOS and Xcode, conversion via `safari-web-extension-converter`, App Store submission, and a $99/year Apple Developer membership. Safari's extension APIs also lag. Realistically its own mini-project, and it requires access to a Mac.

CI builds Firefox from Phase 0 onward so incompatibility is caught continuously rather than discovered all at once.

## Backlog (to become issues at Phase 0)

| Item | Notes |
|---|---|
| Auto-extract company name | v1 leaves `company` best-effort or user-typed. Extract from the current-experience section rather than by parsing headline strings, which vary wildly ("Technical Recruiter @ Stripe", "Stripe \| Recruiting", "Recruiter at Stripe, ex-Meta"). |
| Inject Save on feed post authors | Captures post URL as provenance automatically, removing the manual `source` step. Held back because feed markup is considerably messier than profile markup. |
| ATS adapters | Greenhouse, Lever, Ashby, Workday. Where applications actually happen, and their markup is more stable than LinkedIn's. One small adapter per platform, added incrementally. |
| Generic page fallback | Readability-style main-content extraction for company career pages. |
| Select-text-and-save | Highlight, right-click, save. Works anywhere, never breaks. |
| Link recruiters to JDs | Opening a JD shows who to contact about it. Adds a relational layer to a flat key-value store. |
| Follow-up dates and reminders | Alarms API, notification permission, snooze logic. `career-ops`' `followup-cadence.mjs` is prior art. |
| Edge port | Phase 5. |
| Firefox port | Phase 5. |
| Safari port | Phase 5. Requires a Mac and a paid Apple Developer membership. |
