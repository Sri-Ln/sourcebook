#!/usr/bin/env node
/**
 * Turns a raw LinkedIn capture into a committable fixture.
 *
 *   node scripts/scrub-fixture.mjs tests/fixtures/raw/profile-1.html profile-recruiter-1
 *
 * Two jobs, and the first one matters more than it looks:
 *
 * 1. **Trim to the top card.** A full profile page is ~400KB and carries other
 *    people's names in "people also viewed", comments and connection lists.
 *    Cutting to the region the extractor actually reads removes most of the
 *    personal data before any find-and-replace is attempted.
 *
 * 2. **Replace what identifies the person** — name, vanity slug, member URN,
 *    photo URLs, and any other names left in the fragment.
 *
 * Organisation names are deliberately kept. A company is not personal data, and
 * preserving real ones keeps the headline shapes honest — which is the whole
 * reason for using captured markup instead of invented markup.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const [input, outputName] = process.argv.slice(2);
if (!input || !outputName) {
  console.error('usage: scrub-fixture.mjs <raw-file> <output-name>');
  process.exit(1);
}

const PLACEHOLDER_NAME = 'Jane Placeholder';
const PLACEHOLDER_SLUG = 'jane-placeholder';
const PLACEHOLDER_MEMBER_ID = 'ACoAAPLACEHOLDER0000000000000000000';
const PLACEHOLDER_URN = `urn:li:fsd_profile:${PLACEHOLDER_MEMBER_ID}`;
const MAX_FRAGMENT_BYTES = 30_000;

const dom = new JSDOM(readFileSync(input, 'utf8'));
const doc = dom.window.document;

const realName = doc.title.split('|')[0].trim();
const main = doc.querySelector('main');
if (!main) throw new Error('No <main> found — is this a profile page?');

// The name is an <h2> wrapped in a link to the person's own profile.
const nameNode = [...main.querySelectorAll('h2')].find((h) => h.closest('a[href*="/in/"]'));
if (!nameNode) throw new Error('Could not locate the name element');

const profileHref = nameNode.closest('a[href*="/in/"]').getAttribute('href');
const realSlug = profileHref.match(/\/in\/([^/?#]+)/)?.[1];

// Walk up while the subtree stays small enough to be a readable fixture. The
// last ancestor under the limit is the top card.
let card = nameNode;
while (card.parentElement && card.parentElement !== main) {
  if (card.parentElement.outerHTML.length > MAX_FRAGMENT_BYTES) break;
  card = card.parentElement;
}

// Other people's names appear in connection lists inside the card.
const otherNames = [...card.querySelectorAll('strong')]
  .map((el) => el.textContent.trim())
  .filter((t) => t && t !== realName && /^[\p{L}][\p{L}'’-]+$/u.test(t));

let html = card.outerHTML;

const replacements = [
  [realName, PLACEHOLDER_NAME],
  ...(realSlug ? [[realSlug, PLACEHOLDER_SLUG]] : []),
  ...realName.split(/\s+/).map((part, i) => [part, i === 0 ? 'Jane' : 'Placeholder']),
  ...otherNames.map((n, i) => [n, `Contact${i + 1}`]),
];

for (const [from, to] of replacements) {
  html = html.split(from).join(to);
}

html = html
  // Member ids are matched on the id token itself, not on the surrounding URN.
  // They appear both plainly and URL-encoded (urn%3Ali%3Afsd_profile%3A...),
  // and a pattern anchored to the decoded form silently misses every encoded
  // one — which is exactly what happened the first time this ran.
  //
  // These ids are pseudonymous but stable: each maps to a real account. They do
  // not belong in a public repository.
  .replace(/ACoAA[A-Za-z0-9_-]+/g, PLACEHOLDER_MEMBER_ID)
  .replace(/urn:li:fsd_profile:[A-Za-z0-9_-]+/g, PLACEHOLDER_URN)
  .replace(/https:\/\/media\.licdn\.com\/[^"'\s]*/g, 'https://example.com/avatar.png')
  .replace(/https:\/\/[a-z0-9-]*\.licdn\.com\/[^"'\s]*/g, 'https://example.com/asset');

const output = `<!doctype html>
<!--
  Scrubbed capture of a LinkedIn profile top card.
  Captured: ${new Date().toISOString().slice(0, 10)}
  Page type: /in/<slug>

  Trimmed to the top card and stripped of personal details. Class names are
  LinkedIn's own build hashes and will change on their next deploy - that is
  precisely why the extractor must not depend on them.
-->
<html lang="en">
  <head>
    <title>${PLACEHOLDER_NAME} | LinkedIn</title>
  </head>
  <body>
    <main>${html}</main>
  </body>
</html>
`;

const target = `tests/fixtures/scrubbed/${outputName}.html`;
writeFileSync(target, output);

// Fail loudly rather than committing a leak. Member ids are read from the whole
// source document, not just the trimmed card: the page carries ids for other
// people too, and any of them surviving is the same problem.
const sourceMemberIds = [
  ...new Set(readFileSync(input, 'utf8').match(/ACoAA[A-Za-z0-9_-]+/g) ?? []),
].filter((id) => id !== PLACEHOLDER_MEMBER_ID);

const leaks = [realName, realSlug, ...otherNames, ...sourceMemberIds].filter(
  (v) => v && output.includes(v),
);
if (leaks.length) {
  console.error(`LEAK: ${leaks.length} identifying value(s) survived scrubbing`);
  process.exit(1);
}

console.log(`${target}  ${output.length} bytes  (from ${readFileSync(input).length})`);
