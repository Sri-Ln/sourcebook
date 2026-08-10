## What changed

<!-- One or two sentences. What does this PR do, and why? -->

## Related issue

<!-- Closes #123 -->

## Test evidence

<!--
Paste the actual output of the test run. Not "tests pass" — the output.
If a check was skipped, say which and why.
-->

```
```

## Manual verification

<!--
For anything touching the content script, LinkedIn's real markup is the only
honest test. Which pages did you click through?
-->

- [ ] Profile page — button mounts and saves
- [ ] Soft navigation (profile → profile without reload) — button re-mounts, no duplicates
- [ ] Job page and `/jobs/search` split pane
- [ ] N/A for this change

## Checklist

- [ ] Follows Conventional Commits
- [ ] No real people's data added to committed fixtures
- [ ] Permissions in the manifest unchanged, or the addition is justified above
- [ ] Spec updated if a decision in it changed
