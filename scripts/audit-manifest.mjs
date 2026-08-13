#!/usr/bin/env node
/**
 * Pre-submission audit of the built manifests.
 *
 *   npm run build && npm run build:ff && node scripts/audit-manifest.mjs
 *
 * Exists because permission creep is silent. A permission added for a
 * half-finished feature stays in the manifest, and the cost of noticing at
 * review time is a rejection plus a slow re-review — whereas the cost of
 * noticing here is nothing.
 *
 * Exits non-zero on a finding so it can run in CI.
 */
import { readFileSync, existsSync } from 'node:fs';

const ALLOWED_PERMISSIONS = new Set(['storage', 'activeTab', 'sidePanel']);
const ALLOWED_HOSTS = new Set(['*://*.linkedin.com/*']);
const REQUIRED_ICONS = ['16', '32', '48', '128'];

const findings = [];
const checked = [];

function check(label, ok, detail) {
  checked.push(`${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!ok) findings.push(`${label}: ${detail}`);
}

function auditChrome(manifest) {
  const permissions = new Set(manifest.permissions ?? []);
  const extra = [...permissions].filter((p) => !ALLOWED_PERMISSIONS.has(p));

  check(
    'chrome: no unexpected permissions',
    extra.length === 0,
    `unexpected ${JSON.stringify(extra)}`,
  );

  const hosts = manifest.host_permissions ?? [];
  const extraHosts = hosts.filter((h) => !ALLOWED_HOSTS.has(h));
  check(
    'chrome: no unexpected host permissions',
    extraHosts.length === 0,
    `unexpected ${JSON.stringify(extraHosts)}`,
  );

  // The single biggest driver of slow review and user distrust.
  const broad = [...permissions, ...hosts].filter((p) => /<all_urls>|^\*:\/\/\*\/\*$/.test(p));
  check('chrome: no broad host access', broad.length === 0, `found ${JSON.stringify(broad)}`);

  check(
    'chrome: icons declared at every required size',
    REQUIRED_ICONS.every((size) => manifest.icons?.[size]),
    `have ${JSON.stringify(Object.keys(manifest.icons ?? {}))}`,
  );

  check(
    'chrome: single-purpose description present',
    typeof manifest.description === 'string' && manifest.description.length > 0,
    'missing description',
  );

  check(
    'chrome: description does not imply LinkedIn affiliation',
    !/official|partnered|endorsed|in partnership/i.test(manifest.description ?? ''),
    'description implies affiliation',
  );

  check('chrome: manifest v3', manifest.manifest_version === 3, `v${manifest.manifest_version}`);

  // Remote code is an automatic rejection, and easy to introduce accidentally
  // through a CDN-hosted dependency.
  const csp = JSON.stringify(manifest.content_security_policy ?? {});
  check(
    'chrome: no remote script in CSP',
    !/https?:\/\//.test(csp),
    `CSP references a remote origin: ${csp}`,
  );
}

function auditFirefox(manifest) {
  const id = manifest.browser_specific_settings?.gecko?.id;
  check('firefox: extension id declared', Boolean(id), 'missing gecko.id');

  check(
    'firefox: data collection declared',
    Boolean(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required),
    'AMO requires data_collection_permissions for new extensions',
  );
}

function auditRepo() {
  check('repo: privacy policy present', existsSync('PRIVACY.md'), 'PRIVACY.md missing');

  const privacy = existsSync('PRIVACY.md') ? readFileSync('PRIVACY.md', 'utf8') : '';

  // The policy and the manifest must agree; a mismatch between the two is a
  // common rejection reason and an easy one to drift into.
  for (const permission of [...ALLOWED_PERMISSIONS, ...ALLOWED_HOSTS]) {
    check(
      `repo: privacy policy explains "${permission}"`,
      privacy.includes(permission),
      'permission not explained in PRIVACY.md',
    );
  }

  check(
    'repo: privacy policy states the sync caveat',
    /storage\.sync/.test(privacy) && /browser/i.test(privacy),
    'sync behaviour not disclosed',
  );

  check(
    'repo: affiliation disclaimer present',
    /not affiliated/i.test(privacy),
    'missing disclaimer',
  );
}

const chromePath = '.output/chrome-mv3/manifest.json';
const firefoxPath = '.output/firefox-mv2/manifest.json';

if (!existsSync(chromePath) || !existsSync(firefoxPath)) {
  console.error('Build both targets first: npm run build && npm run build:ff');
  process.exit(2);
}

auditChrome(JSON.parse(readFileSync(chromePath, 'utf8')));
auditFirefox(JSON.parse(readFileSync(firefoxPath, 'utf8')));
auditRepo();

for (const line of checked) console.log(line);

if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`\nAll ${checked.length} checks passed.`);
