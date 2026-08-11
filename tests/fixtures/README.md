# Test fixtures

Extractors are pure `HTML -> object` functions. Fixtures are their input, and the mechanism for catching **selector rot**: when LinkedIn ships a redesign, refresh the fixture and the failing tests point at exactly what moved.

## Two directories, and why

| Directory | Committed? | Contains |
|---|---|---|
| `raw/` | **No** — gitignored | Real captured pages. Real names, real headlines, real photo URLs. |
| `scrubbed/` | **Yes** | Same markup structure, every human detail replaced. |

`raw/` stays local because those pages belong to real people who did not agree to appear in a public repository. Keep raw captures — they are genuinely useful for diagnosing a redesign — just never commit one.

Hand-written fixture HTML was considered and rejected. It tests selectors against the author's own assumptions, so it can pass happily while real extraction fails. Scrubbing preserves LinkedIn's actual nesting and mangled class names, which is the part that makes the test meaningful.

## Capturing a raw fixture

1. Open the page in Chrome while logged in.
2. DevTools → Elements → right-click the `<html>` node → **Copy** → **Copy outerHTML**.
3. Save to `tests/fixtures/raw/<name>.html`.

Prefer `Copy outerHTML` over `Ctrl+S`. LinkedIn renders client-side, so saving the page can capture the pre-hydration document rather than what you actually see.

## Scrubbing

Replace every one of these before the file moves to `scrubbed/`:

- **Name** → `Jane Placeholder`
- **Headline** → something structurally similar, e.g. `Technical Recruiter at Placeholder Corp`
- **Company** → `Placeholder Corp`
- **Profile URLs and vanity slugs** → `/in/jane-placeholder`
- **Photo and media URLs** → `https://example.com/avatar.png`
- **Member IDs, URNs, tracking IDs** → invented values of the same shape
- **Anyone else on the page** — commenters, recommenders, "people also viewed" — same treatment or delete the subtree entirely

Keep the shape, change the content. If a class name or nesting level matters to a selector, leave it exactly as captured.

Trim aggressively otherwise: a full LinkedIn page is enormous and most of it is irrelevant. Delete subtrees your extractor will never touch. Smaller fixtures make failures easier to read.

## Header comment

Every scrubbed fixture starts with a comment recording what it is and when it was captured:

```html
<!--
  Scrubbed capture of a LinkedIn profile page.
  Captured: 2026-08-10
  Page type: /in/<slug>
-->
```

The date matters. When a test fails a year from now, the first question is how old the fixture is.

## Verifying a scrub

Before committing, confirm the original details are gone:

```bash
grep -i "real name" tests/fixtures/scrubbed/<name>.html   # expect no matches
```

Then check nothing from `raw/` is staged:

```bash
git status --short tests/fixtures/
```

## Using a fixture in a test

```ts
import { loadFixture } from '../helpers/loadFixture.js';

const doc = loadFixture('profile-placeholder');
expect(doc.querySelector('h1')?.textContent?.trim()).toBe('Jane Placeholder');
```

`loadFixture` can only read from `scrubbed/`. Attempting to reach `raw/` throws — a helper that can load real people's data is a helper that will eventually put some in a committed snapshot.

## A note on `profile-placeholder.html`

It is invented, not captured. It exists so the harness has something to load and assert against, and it proves nothing about real extraction. Real scrubbed fixtures arrive with the profile extractor (#10). Do not build production selectors against it.
