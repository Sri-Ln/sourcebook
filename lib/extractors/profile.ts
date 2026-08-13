export interface ProfileDraft {
  name?: string;
  profileUrl?: string;
  memberId?: string;
  headline?: string;
  /** Always undefined in v1. Reliable extraction is #29. */
  company?: undefined;
  /** Which strategies fell back or failed, so selector rot is visible. */
  warnings: string[];
}

/**
 * Degree markers ("· 1st", "· 2nd") and pronoun chips sit between the name and
 * the headline in the top card. They are not the headline.
 */
const DEGREE_MARKER = /^·/;
const PRONOUNS = /^(he|she|they|ze|xe|per|ey)\s*\/\s*\w+/i;

/**
 * Extracts what can be read from a LinkedIn profile page.
 *
 * **Semantics first, never class names.** LinkedIn ships build-hashed classes —
 * `_8707df48`, `fd450801` — that change on every deploy, and there is no `<h1>`,
 * no JSON-LD, and no `og:` meta on an authenticated profile page. What survives
 * a redesign is structure and meaning: a heading inside a link to `/in/`, the
 * document title, and URL shapes.
 *
 * Never throws. A page LinkedIn has restructured is an ordinary outcome: the
 * panel opens with blank fields and the user fills them in. Missing data is
 * recorded in `warnings` so rot is diagnosable rather than mysterious.
 */
export function extractProfile(doc: Document): ProfileDraft {
  const warnings: string[] = [];

  const main = doc.querySelector('main') ?? doc.body;
  const nameLink = main?.querySelector<HTMLAnchorElement>('a[href*="/in/"]:has(h2)') ?? null;
  const nameNode =
    nameLink?.querySelector('h2') ??
    [...(main?.querySelectorAll('h2') ?? [])].find((h) => h.closest('a[href*="/in/"]')) ??
    null;

  const name = readName(doc, nameNode, warnings);
  const profileUrl = readProfileUrl(nameNode, warnings);
  const memberId = readMemberId(main, warnings);
  const headline = readHeadline(nameNode, warnings);

  return { name, profileUrl, memberId, headline, company: undefined, warnings };
}

function readName(
  doc: Document,
  nameNode: Element | null,
  warnings: string[],
): string | undefined {
  const fromNode = nameNode?.textContent?.trim();
  if (fromNode) return fromNode;

  warnings.push('name: heading not found, falling back to document title');

  // "Jane Placeholder | LinkedIn". Reliable, and the last thing LinkedIn would
  // change — but a bare "LinkedIn" means we are not on a profile at all.
  const [candidate] = (doc.title ?? '').split('|');
  const fromTitle = candidate?.trim();

  if (!fromTitle || fromTitle.toLowerCase() === 'linkedin') {
    warnings.push('name: document title did not contain a profile name');
    return undefined;
  }

  return fromTitle;
}

function readProfileUrl(nameNode: Element | null, warnings: string[]): string | undefined {
  const href = nameNode?.closest('a[href*="/in/"]')?.getAttribute('href');

  if (!href) {
    warnings.push('profileUrl: no link to /in/ found near the name');
    return undefined;
  }

  try {
    // Relative hrefs are common; the base only matters for resolution.
    const url = new URL(href, 'https://www.linkedin.com');

    // Normalised so dedupe is reliable: query strings carry tracking that
    // differs per visit, and casing differs between links to the same person.
    return `https://www.linkedin.com${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    warnings.push(`profileUrl: could not parse "${href}"`);
    return undefined;
  }
}

function readMemberId(main: Element | null, warnings: string[]): string | undefined {
  // The message link carries the member's URN. Unlike a vanity slug, this does
  // not change when the person edits their profile.
  const href = main?.querySelector('a[href*="profileUrn="]')?.getAttribute('href');
  const id = href ? decodeURIComponent(href).match(/ACoAA[A-Za-z0-9_-]+/)?.[0] : undefined;

  if (!id) warnings.push('memberId: no profileUrn found; dedupe will fall back to the URL');

  return id;
}

function readHeadline(nameNode: Element | null, warnings: string[]): string | undefined {
  if (!nameNode) {
    warnings.push('headline: skipped because the name element was not found');
    return undefined;
  }

  const scope = nameNode.closest('main') ?? nameNode.ownerDocument.body;

  // Document order rather than a fixed walk up the tree. Counting ancestors
  // encodes today's nesting depth, which is exactly the kind of assumption
  // LinkedIn's next redesign invalidates; "the first paragraph after the name"
  // survives re-nesting.
  const paragraphs = [...scope.querySelectorAll('p')].filter(
    (p) =>
      nameNode.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

  for (const paragraph of paragraphs) {
    const text = paragraph.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (DEGREE_MARKER.test(text) || PRONOUNS.test(text)) continue;

    return text;
  }

  warnings.push('headline: no candidate paragraph found in the top card');
  return undefined;
}
