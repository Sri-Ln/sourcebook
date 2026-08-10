# Security policy

## Reporting a vulnerability

Please report security issues privately through [GitHub Security Advisories](https://github.com/Sri-Ln/sourcebook/security/advisories/new) rather than opening a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. Expect an initial response within a week.

## Scope

sourcebook is a browser extension with no backend. There is no server to attack and no account system to compromise. The interesting attack surface is narrower than usual:

- **Content script injection.** The extension runs inside LinkedIn's page. A flaw that let page-controlled content escape into the extension's privileged context would be serious.
- **Stored data exposure.** Saved recruiters and job descriptions live in browser storage. Anything that let another extension or a web page read them is in scope.
- **Permission escalation.** The extension requests `storage`, `activeTab`, and host access to `*://*.linkedin.com/*`. Anything that effectively widens that is in scope.

## Not in scope

- LinkedIn's own vulnerabilities — report those to LinkedIn.
- The fact that saved data is stored unencrypted in browser storage. This is by design; browser storage is protected by the OS user account, and adding a passphrase would trade real usability for marginal gain against an attacker who already has your unlocked machine.

## Data handling

The extension has no backend, sends no telemetry, and makes no network requests of its own. Data stays in `chrome.storage`. Nothing is transmitted anywhere.
