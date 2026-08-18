# Chrome Web Store listing

Draft copy for submission. Kept in the repo so the listing and the code change together — a listing that drifts from what the extension does is both a review risk and a broken promise.

## Name

**sourcebook**

Deliberately not "LinkedIn Recruiter Saver" or similar. Using another company's trademark in an extension name draws review scrutiny and implies affiliation that does not exist.

## Short description (132 char max)

> Save the recruiters worth remembering, and the job descriptions worth keeping. Everything stays in your browser.

*(112 characters.)*

## Category

Productivity

## Detailed description

> Job searching means finding the same people twice.
>
> A recruiter surfaces while you are browsing a company's team, or halfway through someone else's post. Weeks later a relevant role opens up and you cannot remember who they were — so you go looking all over again.
>
> sourcebook saves them in one click, with the context you will actually need later.
>
> **What it does**
>
> • Save a recruiter from their LinkedIn profile — name, headline, company, and how you found them
> • Record why they mattered, in a note you will thank yourself for
> • Track outreach: not contacted, messaged, referred, closed
> • Search across names, companies, and your own notes
> • Filter to everyone you have never contacted — the list that matters when a role opens
> • Save job descriptions and export them as clean text
>
> **What it does not do**
>
> • No bulk scraping. It saves the page you are looking at, when you click Save.
> • No automated messaging or connection requests.
> • No account, no server, no telemetry. Your data stays in your browser.
>
> **Your data is yours**
>
> Everything is stored by your browser, on your machine. There is no backend to breach and no account to create. Export the lot as JSON whenever you like.
>
> sourcebook is an independent tool, not affiliated with or endorsed by LinkedIn.

## Permission justifications

Store review asks for these individually. Answer plainly — vague justifications get sent back.

| Permission | Justification |
|---|---|
| `storage` | Saves the user's recruiters and job descriptions in browser storage. There is no server; this is the only place data goes. |
| `activeTab` | The popup's "Save current page" button reads the URL and content of the LinkedIn tab the user is looking at, only at the moment they click it. |
| `*://*.linkedin.com/*` | The extension adds a Save button to LinkedIn profile pages and reads the profile being viewed to prefill the form. It runs on no other site. |

**Single purpose:** saving LinkedIn recruiter contacts and job descriptions for the user's own later reference.

## Data disclosure form

Every category answers **no**. The form and the privacy policy must agree — a mismatch between them is a common rejection reason.

- Personally identifiable information: **not collected**
- Health, financial, authentication, personal communications, location, web history, user activity: **not collected**
- Website content: **not collected** *(read locally to prefill a form; never transmitted)*

Certify all three: not sold to third parties; not used for anything unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/Sri-Ln/sourcebook/blob/main/PRIVACY.md

## Screenshots — still to capture

**These need real usage and cannot be generated.** 1280×800, and a synthetic mock-up would misrepresent the product.

Suggested set:

1. A LinkedIn profile with the Save button visible beside Message
2. The save panel open, prefilled, with a note being typed
3. The popup showing a saved list with varied outreach statuses
4. The popup filtered to "Not contacted"
5. The options page showing the quota meter and export

Blur or use your own test accounts — do not publish screenshots containing a real recruiter's name and photo. That is the same reasoning as the fixture scrub policy, and it applies more publicly here.

## Before submitting

- [ ] `npm run audit` passes
- [ ] Screenshots captured, with no identifiable third parties
- [ ] Privacy policy URL resolves publicly
- [ ] Data disclosure form matches PRIVACY.md exactly
- [ ] Loaded unpacked and clicked through the full flow one final time
