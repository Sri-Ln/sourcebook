# sourcebook

A browser extension for saving the people and the postings that matter during a job search.

Recruiters and hiring managers surface at inconvenient moments — while browsing a company's people, or halfway through someone else's post. By the time a relevant opening appears, they have to be rediscovered from scratch. sourcebook saves them in one click, with enough context to still be useful months later.

It also captures job descriptions and hands them to [rolecraft](https://github.com/Sri-Ln/rolecraft), which uses them to derive concepts, tech stacks, and portfolio projects worth building.

> **Status:** early development. Not yet published to any extension store.

## Why an extension

rolecraft can already process a job description from a URL. But LinkedIn job pages sit behind an authentication wall and will not fetch server-side, so that path quietly degrades into manual copy-paste.

An extension runs inside the authenticated session. It can reach text no server-side fetch can.

## What it does

- **Save a recruiter** from a LinkedIn profile, capturing name, headline, company, and — importantly — *how you found them*.
- **Track outreach state** (not contacted → messaged → replied → referred) so the list is actionable rather than an archive.
- **Save a job description** and export every unsent one to the clipboard, already formatted for rolecraft's inbox.

## What it deliberately does not do

- **No bulk harvesting.** It saves the profile currently on your screen, on an explicit click. Scraping search results in bulk violates LinkedIn's terms, risks your account, and gets extensions pulled from stores.
- **No automated outreach.** No messages sent, no connection requests.
- **No backend.** Data lives in your browser. There is no server, no account, and nothing uploaded.

## Where your data lives

Recruiters are stored in `chrome.storage.sync`, which syncs across browsers signed into the same profile. Job descriptions are stored in `chrome.storage.local`, since a single description can exceed the entire sync quota.

Nothing leaves your machine. Nothing is committed to this repository.

## Stack

[WXT](https://wxt.dev) and TypeScript. React for the popup; plain TypeScript in a Shadow DOM for the in-page button, so no framework is shipped into LinkedIn's own document.

Chrome first. Edge, Firefox, and Safari are planned — WXT treats the browser target as a build flag, which is most of why it was chosen.

## Documentation

- [Design spec](docs/superpowers/specs/2026-08-10-sourcebook-extension-design.md) — architecture, data model, trade-offs, and what was deliberately deferred.

## Contributing

`main` is protected and takes merge commits only. Work happens on prefixed branches, follows [Conventional Commits](https://www.conventionalcommits.org/), and lands through a reviewed pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit message format, the review loop, and the test fixture policy.

## License

[MIT](LICENSE)
