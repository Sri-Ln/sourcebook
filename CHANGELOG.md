# Changelog

Notable changes, newest first. Each released version has a matching [GitHub release](https://github.com/Sri-Ln/sourcebook/releases) carrying the packaged Chrome and Firefox builds.

This project follows [semantic versioning](https://semver.org/). Before 1.0 the minor version moves for features and the patch version for fixes; nothing is promised to be stable yet.

## Unreleased

## 0.2.1 — 2026-08-17

### Fixed

- **The follow-up calendar was almost entirely unstyled.** A rule meant for the edit form's Cancel and Update buttons — `.edit-form button[type='button']` — reached every button the form contains, which is all 42 calendar days, both month arrows, Clear, Done, the date trigger and the tag chips. Being a class plus a type plus an attribute, it outranked each component's own rules and flattened them to muted text on a transparent background inside a plain border.

  So today had no indicator, the chosen date had no fill, and Done showed no colour on hover. Those rules were correct throughout 0.2.0 and were being silently overridden; the calendar rendered as a grid of empty boxes. The rule is now scoped to `.edit-form__actions`, which holds the two buttons it was written for.

  Invisible to the test suite by construction: jsdom applies no cascade for these stylesheets, so every test passed with the calendar unstyled. Verification now drives the built `sidepanel.html` with a stubbed extension API, so what is measured is the shipped bundle and stylesheet in their real structure.

- **The calendar's Done button is solid accent from the start**, rather than a dark neutral that only took colour on hover, and its label is flex-centred instead of placed by padding and the font's own metrics. Hover lifts it with a brightness change, matching Update and the save button, instead of switching the fill to green.

## 0.2.0 — 2026-08-17

### Changed

- **The edit form only offers what is worth editing.** Name, headline and "found via" are gone: you do not retype someone's name, and a headline you would correct is a headline you would rather not read. Company stays, because the list is grouped by it, so a wrong one is the single mistake that costs you something — extraction can fail to read a company at all, and those people land under "No company" with no way back out.

  Everything the form no longer offers is preserved untouched on save. Running those fields through the same "blank means omit" rule as the editable ones would have deleted a headline every time someone fixed a typo in a note.

- **The `replied` outreach status has been removed.** It is a thing that happens to you rather than a thing you do, and it changed nothing about what to do next. The four states left are all states you act on.

  Records saved under a retired status fail validation and are quarantined rather than shown, so this was only safe because nothing was stored under it yet. Removing another one will need a migration.

- **Messaged is now green**, drawn from a new `--success` token shared with the calendar's Done button. Not contacted and Closed stay neutral, Referred stays purple.

### Added

- **A real calendar for the follow-up date**, replacing `input[type="date"]`, whose picker is drawn by the operating system and cannot be styled. Hand-built rather than taken from a package: the ones worth using bring a date library and a timezone library behind them, to produce the `YYYY-MM-DD` string this app already treats as its currency. It costs 4 kB.

  Arrows by day and week, Home and End to the ends of a row, PageUp and PageDown by month, Enter to choose, Escape to leave, and one tab stop for the whole grid. Month arithmetic runs at UTC midnight, with tests pinned to both 2026 daylight-saving transitions.

- **Tag suggestions built from your own tags.** Three chips under the Tags field, most used first, excluding whatever is already on the record; typing turns them into matches from every tag you have used. No preset vocabulary, nothing new in storage, and empty until you have tagged something. `fintech` and `Fintech` count as one tag, keeping the spelling you use more often.

- **Removing a recruiter asks first.** The × sits a pixel from Edit on a row you were only scanning, and removal destroys the note, tags, status and follow-up date. A native `<dialog>`, with Cancel focused rather than the destructive action.

### Fixed

- **Both Save buttons stay in step with each other.** Saving from the page left the panel showing the opposite state, and deleting from the panel left the page still claiming "Saved ✓" until a reload. Each button asked the store once and then remembered the answer; both now watch `storage.onChanged`, which fires in every extension context including content scripts.

- **The `Due` filter chip shares a row with the outreach statuses** instead of being stranded on a line of its own.

- **The tag filter row no longer grows without limit.** Every tag ever used earned a permanent chip; it is now the three most used, plus any filter currently switched on so it can still be turned off.

- **The status pill on each card shows its colour.** It read `var(--status)` for its text and tinted background, but only the dropdown ever set that, so the pill fell back to plain ink over a transparent background and the status hues appeared in the open menu and nowhere else.

- **Calendar columns line up with the day letters.** The header row and each week were separate grids, and `1fr` never shrinks a column below its content, so rows of single letters and two-digit dates disagreed about column widths.

- **Today is visible, and the chosen date is highlighted.** Today was marked with a border measuring 1.75:1 against the panel surface, and the keyboard cursor was drawn through `:focus-visible`, which Chrome does not match when focus moves programmatically after a mouse click — so opening the calendar with the mouse marked nothing at all.

- **The month arrows are centred.** They were a large button around a mark about 5px wide, because `‹` paints at that width whatever its font-size.

- **The calendar footer reads the right way up.** Neither button showed a hover border, and the first fix put the affirmative colour on Clear while Done answered with almost nothing. Clear and Done were also different sizes.

- **The Remove button in the confirm dialog is no longer grey until hovered**, and is quiet at rest with a red border on hover and on focus rather than a filled red.

- **The edit form sits on its own full-width row** instead of being crushed between the name and the action buttons.

## 0.1.3 — 2026-08-16

### Fixed

- **The Save button now appears on profiles you cannot message.** It was anchored to the link to the messaging composer, which LinkedIn omits when there is no connection, privacy restricts it, or you have no InMail — so on those profiles the button waited for an element that was never coming and gave up silently. It now anchors to the person's name, the one element a profile cannot omit, and still sits beside Message whenever that exists.

  Where Message is absent it now sits beside the overflow ("More") control, which every profile has and which is in the same action row — found by its `aria-expanded` attribute rather than its label.

  Every rule is matched on structure and URL shape rather than on button text, because LinkedIn is localised and "Connect" is not "Connect" for everyone.

## 0.1.2 — 2026-08-16

### Added

- **Remove a saved person from their profile page.** The Save button toggles: click "Saved" to remove, with an eight second Undo. Undo restores the exact record — same note, same tags, same follow-up date — rather than a fresh one rebuilt from the page, because removal destroys things the page cannot reconstruct.

### Changed

- The side panel no longer carries a title above the save button. The browser already labels the panel.

## 0.1.1 — 2026-08-16

### Fixed

- **The Save button now appears on the profile page.** A profile carries five links to the messaging composer, and the button was mounting beside the first in document order — LinkedIn's sticky header, which is off-screen until you scroll. It now prefers a link that actually renders, and among those the one following the person's name, which is the top card's action row. The button is also filled and sized to sit among LinkedIn's own pill buttons rather than being a transparent outline that was easy to miss even when correctly placed.
- **The side panel's save button follows the active tab.** It probed once on mount, so after a single save it read "Saved" on every profile visited afterwards, and stayed disabled — meaning those people could not be saved from the panel at all.

### Changed

- **Outreach status is a real listbox rather than a `<select>`.** A native select's menu is drawn by the operating system and cannot be styled, so the open state stayed plain however the closed control looked. Arrow keys, Home, End, Enter and Escape are implemented and tested; the menu is promoted to the top layer so the scrolling panel cannot clip it.
- **Company headings are larger than the names beneath them.** They were previously the same size, leaving nothing to separate a heading from a row.
- The side panel has a proper token set, focus rings, and status colours distinguished by hue at matched lightness.

### Added

- The content script stamps `data-sourcebook="<version>"` on the page, so "the script never ran" and "the script ran but did not mount" can be told apart in one query. Reloading an extension does not re-inject content scripts into already-open tabs, and that distinction cost two rounds of diagnosis.

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
