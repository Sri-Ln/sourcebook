# sourcebook

A browser extension for saving the people and the postings that matter during a job search.

Recruiters and hiring managers surface at inconvenient moments — while browsing a company's people, or halfway through someone else's post. By the time a relevant opening appears, they have to be rediscovered from scratch. sourcebook saves them in one click, with enough context to still be useful months later.

It also captures job descriptions and hands them to [rolecraft](https://github.com/Sri-Ln/rolecraft), which uses them to derive concepts, tech stacks, and portfolio projects worth building.

> **Status:** early development. Not yet published to any extension store, so
> installing means loading it yourself. It takes about a minute.

## Install it

Not in the Chrome Web Store yet, so this is a manual load. Nothing here needs a
developer toolchain.

**Chrome, Edge or Brave**

1. Download `sourcebook-<version>-chrome.zip` from the
   [latest release](https://github.com/Sri-Ln/sourcebook/releases/latest).
2. Unzip it, and **put the folder somewhere you will leave it** — see the warning
   below.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**, top right.
5. Click **Load unpacked** and choose the unzipped folder.
6. Open a LinkedIn profile and **reload the tab**.

That last step is not optional and is the most common thing to go wrong. Chrome
does not inject content scripts into tabs that were already open, so the Save
button will not appear on a page you had open before installing. Reload it. The
same applies every time you update or reload the extension.

Chrome will warn you about running extensions in developer mode. That is
expected for anything loaded this way and does not indicate a problem.

> [!IMPORTANT]
> **Do not move or rename the folder afterwards.** Chrome derives the identity of
> an unpacked extension from its folder path, and everything you save is filed
> under that identity. Move the folder and Chrome treats it as a different
> extension with empty storage. Your recruiters are not deleted, but they stop
> being visible, and moving the folder back is what brings them back.

**Updating**

Download the new zip, replace the *contents* of the same folder, then click the
reload arrow on `chrome://extensions`. Keeping the path unchanged is what keeps
your saved recruiters. Then reload any LinkedIn tab you had open.

**Firefox**

The Firefox build is unsigned, so it can only be loaded temporarily: open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and
select `sourcebook-<version>-firefox.zip`. It is removed when Firefox restarts.
A permanent install needs the add-on signed by Mozilla, which has not been done
yet.

## Using it

- On a LinkedIn profile, click **Save** beside the Message button. If it is not
  there, reload the tab.
- Open the side panel from the toolbar icon to see everyone you have saved,
  grouped by company.
- **Edit** on a card adds a note, tags and a follow-up date. Tag suggestions come
  from tags you have already used, so they start empty and get useful.
- The status pill tracks outreach; the **Due** filter answers "who should I chase
  today".

## Back it up

Right-click the toolbar icon and choose **Options**, then find **Export and
import** and click **Export all data**. You get a readable
`sourcebook-<date>.json` holding every field of every record. **Import from a
JSON file**, on the same page, puts it back.

Do this occasionally. It is the one thing that survives everything else: a moved
folder, a different browser, a different machine, a reinstall, or eventually
moving to the Chrome Web Store — none of which carry your saved recruiters across
on their own, because browsers file extension data under an identity that changes
in all of those cases.

If your list ever looks empty when it should not:

1. **Do not click Remove** on the extension. That is the step that actually
   deletes the stored data; everything before it is recoverable.
2. If you moved the folder, move it back to exactly where it was. The records
   come back with it.
3. Otherwise, import your last export.

## Why an extension

rolecraft can already process a job description from a URL. But LinkedIn job pages sit behind an authentication wall and will not fetch server-side, so that path quietly degrades into manual copy-paste.

An extension runs inside the authenticated session. It can reach text no server-side fetch can.

## What it does

- **Save a recruiter** from a LinkedIn profile, capturing name, headline, company, and — importantly — *how you found them*.
- **Track outreach state** (not contacted → messaged → referred → closed) so the list is actionable rather than an archive.
- **Save a job description** and export every unsent one to the clipboard, already formatted for rolecraft's inbox.

## What it deliberately does not do

- **No bulk harvesting.** It saves the profile currently on your screen, on an explicit click. Scraping search results in bulk violates LinkedIn's terms, risks your account, and gets extensions pulled from stores.
- **No automated outreach.** No messages sent, no connection requests.
- **No backend.** Data lives in your browser. There is no server, no account, and nothing uploaded.

## Where your data lives

Recruiters are stored in `chrome.storage.sync`, which syncs across browsers signed into the same profile. Job descriptions are stored in `chrome.storage.local`, since a single description can exceed the entire sync quota.

Nothing leaves your machine. Nothing is committed to this repository.

## Stack

[WXT](https://wxt.dev) and TypeScript. React for the side panel; plain TypeScript in a Shadow DOM for the in-page button, so no framework is shipped into LinkedIn's own document.

Chrome first. Edge, Firefox, and Safari are planned — WXT treats the browser target as a build flag, which is most of why it was chosen.

## Documentation

- [Design spec](docs/superpowers/specs/2026-08-10-sourcebook-extension-design.md) — architecture, data model, trade-offs, and what was deliberately deferred.
- [Privacy policy](PRIVACY.md) — what is stored, where, and the one caveat about browser sync.
- [Store listing](docs/store-listing.md) — submission copy and the pre-submission checklist.

## Contributing

`main` is protected and takes merge commits only. Work happens on prefixed branches, follows [Conventional Commits](https://www.conventionalcommits.org/), and lands through a reviewed pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit message format, the review loop, and the test fixture policy.

## License

[MIT](LICENSE)
