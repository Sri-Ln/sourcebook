# Contributing

## Branches

`main` is protected. Nothing lands on it directly — not even for the repo owner.

Work on a branch named for what it does:

| Prefix | For |
|---|---|
| `feat/` | New capability |
| `fix/` | Bug fix |
| `docs/` | Documentation |
| `chore/` | Housekeeping, config, dependencies |
| `test/` | Tests |
| `refactor/` | Restructuring with no behaviour change |

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), with the issue number in the subject and a closing footer:

```
feat(popup): add recruiter list with search (#12)

Search spans name, headline, company, tags, and note.
Filter state persists across popup closes.

Closes #12
```

Three things are doing work there:

- **The scope** (`popup`) names the part of the codebase touched, so history stays groupable by area.
- **`(#12)`** in the subject autolinks on GitHub and is visible in `git log --oneline`.
- **`Closes #12`** in the footer closes the issue automatically when the PR merges. Without it, closing 35 issues becomes manual, and manual steps quietly stop happening.

Use `Refs #12` instead when the commit relates to an issue but does not finish it.

If a commit genuinely has no issue — a typo fix, a dependency bump — omit both the number and the footer. Do not invent an issue to satisfy the format.

### Types

The type is not decoration. With release tooling it decides the version bump.

| Type | Meaning | Version bump |
|---|---|---|
| `feat` | New capability | **minor** |
| `fix` | Bug fix | **patch** |
| `perf` | Performance improvement | patch |
| `docs` | Documentation only | none |
| `test` | Adding or fixing tests | none |
| `refactor` | Restructuring, no behaviour change | none |
| `build` | Build system or dependencies | none |
| `ci` | CI configuration | none |
| `style` | Formatting and whitespace only | none |
| `chore` | Housekeeping with no user-visible change | none |
| `revert` | Undoes a previous commit | varies |

`chore` is the "none of the above" bucket, and it gets abused as a dumping ground. If `ci`, `build`, `docs`, `test`, or `refactor` fits, use that instead — it is more informative and costs nothing.

Breaking changes get a `!` after the type (`feat(storage)!:`) and a `BREAKING CHANGE:` footer explaining the migration.

## Pull requests

Fill in the template. Two parts of it are not optional:

- **Test evidence.** Paste the actual output of the run, not the words "tests pass". If a check was skipped, say which and why.
- **Manual verification.** For anything touching the content script, LinkedIn's real markup is the only honest test. Fixtures catch selector rot; they do not prove the button mounts on a live page.

**Never self-merge.** Open the PR and stop. Review is the gate, and the merge button stays disabled until every review conversation is resolved.

`main` takes **merge commits only** — squash and rebase merging are disabled at the repo level, so each branch keeps the shape of how it was developed.

## Responding to review

One commit per review comment, each replying in its own thread. That keeps the mapping between feedback and fix legible, rather than burying five unrelated fixes in one "address review" commit.

Review feedback gets verified, not reflexively implemented. A comment that appears technically wrong deserves a reasoned reply rather than a bad change made to look agreeable.

## Test fixtures

Extractors are pure `HTML -> object` functions tested against saved LinkedIn markup. There are two fixture directories, and the split is deliberate:

- **`tests/fixtures/raw/` — gitignored, never committed.** Raw captures contain real people's names, headlines, and photo URLs. Those people did not agree to appear in a public repository. Use raw captures locally for development and for diagnosing what moved after a LinkedIn redesign.
- **`tests/fixtures/scrubbed/` — committed.** Same markup structure, every human detail replaced with placeholders.

Hand-written fixture HTML was considered and rejected: it tests selectors against the author's own assumptions, and can pass happily while real extraction fails.

**Never paste raw LinkedIn HTML into an issue or PR.** Describe the structure, or attach a scrubbed snippet.

## Local development

```bash
npm install
npm run dev        # WXT dev server with hot reload
npm test           # Vitest
npm run build      # Chrome
npm run build:ff   # Firefox
```

Firefox is built from the start so cross-browser breakage surfaces continuously rather than all at once at Phase 5.

## Releasing

Releases are driven by tags, not by a bot.

```bash
# 1. Bump the version and update the changelog, on a branch, through a PR
#    as usual. The tag must match package.json exactly.
# 2. Once that PR is merged:
git checkout main && git pull
git tag v0.2.0
git push origin v0.2.0
```

Pushing the tag runs `.github/workflows/release.yml`, which re-runs lint,
typecheck and tests, builds and packages both browsers, audits the manifests,
and publishes a GitHub release with the two zips attached and notes generated
from the merged pull requests.

**Why tags rather than release-please.** A bot's pull request is created with
`GITHUB_TOKEN`, and GitHub deliberately does not let that token trigger other
workflows. With `verify` a required status check, the release PR would sit
forever with no check to satisfy and no way to merge it. Fixing that needs a
personal access token stored as a secret. Tags avoid the whole problem, and a
release is rare enough that one command is not a burden.

The release build is the one build nobody re-runs before it reaches a user,
which is why the workflow repeats every check rather than trusting the run from
the merge commit.

## Design decisions

Before proposing an architectural change, read the [design spec](docs/superpowers/specs/2026-08-10-sourcebook-extension-design.md). Much of what looks like a missing feature was deferred on purpose, and the spec says why. If a decision in it changes, the spec changes in the same PR.
