import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Committed fixtures only. `raw/` is gitignored and deliberately unreachable. */
const SCRUBBED_DIR = resolve(here, '..', 'fixtures', 'scrubbed');

const SCRUB_DOCS = 'tests/fixtures/README.md';

/**
 * Loads a scrubbed HTML fixture and parses it into a `Document`.
 *
 * Extractors are pure `HTML -> object` functions, so this is how they get their
 * input under test. Fixtures are the mechanism for catching selector rot: when
 * LinkedIn ships a redesign, refresh the fixture and the failing tests point at
 * exactly what moved.
 */
export function loadFixture(name: string): Document {
  const path = resolve(SCRUBBED_DIR, `${name}.html`);

  // Checked before existence, so a traversal attempt reports the real problem
  // rather than an incidental "not found". Raw captures hold real people's
  // names and photo URLs; a helper that can reach them is a helper that will
  // eventually put one in a committed snapshot.
  if (!path.startsWith(SCRUBBED_DIR + sep)) {
    throw new Error(
      `Fixture "${name}" resolves outside ${SCRUBBED_DIR}. ` +
        'Only scrubbed fixtures may be loaded in tests — raw captures contain ' +
        'real people’s data and must never reach a test or a snapshot.',
    );
  }

  if (!existsSync(path)) {
    throw new Error(
      `Fixture "${name}" not found in tests/fixtures/scrubbed/.\n` +
        `Committed fixtures: ${availableFixtures().join(', ') || '(none)'}\n` +
        `If you captured a raw page, scrub it before committing — see ${SCRUB_DOCS}`,
    );
  }

  return new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html');
}

/** Names of every committed fixture, without the `.html` extension. */
export function availableFixtures(): string[] {
  if (!existsSync(SCRUBBED_DIR)) return [];

  return readdirSync(SCRUBBED_DIR)
    .filter((file) => extname(file) === '.html')
    .map((file) => file.slice(0, -'.html'.length))
    .sort();
}
