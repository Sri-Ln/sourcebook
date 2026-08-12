import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH, SCHEMA_VERSION } from './types.js';
import { parseJobDescription, parseRecruiter } from './parse.js';

function validRecruiter(overrides: Record<string, unknown> = {}) {
  return {
    id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: ['fintech'],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function validJobDescription(overrides: Record<string, unknown> = {}) {
  return {
    id: '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
    schemaVersion: SCHEMA_VERSION,
    title: 'Software Engineer, Platform',
    company: 'Placeholder Corp',
    url: 'https://www.linkedin.com/jobs/view/4123456789/',
    rawText: 'We are looking for a platform engineer...',
    capturedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('parseRecruiter', () => {
  it('accepts a well-formed record', () => {
    const result = parseRecruiter(validRecruiter());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Jane Placeholder');
  });

  it('keeps optional fields absent rather than inventing empty strings', () => {
    const result = parseRecruiter(validRecruiter());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('company' in result.value).toBe(false);
      expect('note' in result.value).toBe(false);
    }
  });

  it('reports the offending field by name when one is missing', () => {
    const { name: _dropped, ...withoutName } = validRecruiter();
    const result = parseRecruiter(withoutName);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/name/);
  });

  it('rejects an unknown outreach status', () => {
    const result = parseRecruiter(validRecruiter({ outreach: 'ghosted' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/outreach/);
  });

  it('rejects an unknown source type', () => {
    const result = parseRecruiter(validRecruiter({ source: { type: 'telepathy' } }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/source/);
  });

  it('rejects tags that are not all strings', () => {
    const result = parseRecruiter(validRecruiter({ tags: ['fintech', 7] }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/tags/);
  });

  it('returns every problem at once rather than only the first', () => {
    const result = parseRecruiter(validRecruiter({ outreach: 'ghosted', tags: 'fintech' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });

  it('reports every problem inside source, not just the first', () => {
    const result = parseRecruiter(
      validRecruiter({ source: { type: 'telepathy', url: '', nested: 1 } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join(' | ');
      expect(joined).toMatch(/type/);
      expect(joined).toMatch(/url/);
      expect(joined).toMatch(/nested/);
    }
  });
});

describe('note length cap', () => {
  it('accepts a note of exactly the maximum length', () => {
    const result = parseRecruiter(validRecruiter({ note: 'a'.repeat(NOTE_MAX_LENGTH) }));

    expect(result.ok).toBe(true);
  });

  it('rejects a note one character over', () => {
    const result = parseRecruiter(validRecruiter({ note: 'a'.repeat(NOTE_MAX_LENGTH + 1) }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/note/);
  });

  it('counts characters the way a person does, not the way UTF-16 does', () => {
    // '👍' is two UTF-16 code units but one character to anyone typing it.
    // Counting `.length` would reject a note the UI's counter called legal.
    const result = parseRecruiter(validRecruiter({ note: '👍'.repeat(NOTE_MAX_LENGTH) }));

    expect(result.ok).toBe(true);
  });
});

describe('schema versioning', () => {
  it('rejects a record with no schemaVersion', () => {
    const { schemaVersion: _dropped, ...unversioned } = validRecruiter();
    const result = parseRecruiter(unversioned);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/schemaVersion/);
  });

  it('treats a non-integer version as corruption, not a newer schema', () => {
    // 1.5 > 1 is true, so a naive comparison calls this "newer" and tells the
    // caller to preserve it untouched. It is not newer; it is broken.
    const result = parseRecruiter(validRecruiter({ schemaVersion: 1.5 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('treats Infinity as corruption, not a newer schema', () => {
    const result = parseRecruiter(validRecruiter({ schemaVersion: Infinity }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('distinguishes a newer schema from ordinary corruption', () => {
    // A record written by a newer build, synced from another machine. Mangling
    // it would destroy fields this version does not know about, so the caller
    // needs to tell this case apart and quarantine rather than "repair".
    const result = parseRecruiter(validRecruiter({ schemaVersion: SCHEMA_VERSION + 1 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('newer-schema');
      expect(result.errors.join(' ')).toMatch(/newer/i);
    }
  });

  it('flags ordinary failures with a distinct reason', () => {
    const result = parseRecruiter(validRecruiter({ outreach: 'ghosted' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });
});

describe('unrecognised input', () => {
  it('rejects non-objects without throwing', () => {
    for (const input of [null, undefined, 42, 'a string', []]) {
      const result = parseRecruiter(input);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects unknown keys instead of silently dropping them', () => {
    // Silently discarding a field loses data. Legitimate schema evolution is
    // what schemaVersion is for, so an unexpected key at the current version
    // means corruption and should be visible.
    const result = parseRecruiter(validRecruiter({ favouriteColour: 'blue' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/favouriteColour/);
  });
});

describe('parseJobDescription', () => {
  it('accepts a well-formed record', () => {
    const result = parseJobDescription(validJobDescription());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.company).toBe('Placeholder Corp');
  });

  it('requires the raw text, which is the whole point of the record', () => {
    const { rawText: _dropped, ...withoutText } = validJobDescription();
    const result = parseJobDescription(withoutText);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/rawText/);
  });

  it('allows exportedAt to be absent, which is how "not yet exported" is expressed', () => {
    const result = parseJobDescription(validJobDescription());

    expect(result.ok).toBe(true);
    if (result.ok) expect('exportedAt' in result.value).toBe(false);
  });

  it('does not cap rawText — job descriptions are long by nature', () => {
    const result = parseJobDescription(validJobDescription({ rawText: 'x'.repeat(50_000) }));

    expect(result.ok).toBe(true);
  });

  it('rejects a non-ISO timestamp', () => {
    const result = parseJobDescription(validJobDescription({ capturedAt: '12 August 2026' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/capturedAt/);
  });

  it.each([
    ['2026-02-30T10:00:00.000Z', 'February 30th'],
    ['2026-04-31T10:00:00.000Z', 'April 31st'],
  ])('rejects %s, which is %s and does not exist', (timestamp) => {
    // Date.parse silently rolls these over: 2026-02-30 becomes 2026-03-02. It
    // matches the ISO shape and parses to a finite number, so nothing catches
    // it unless the components are compared back.
    const result = parseJobDescription(validJobDescription({ capturedAt: timestamp }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/capturedAt/);
  });
});
