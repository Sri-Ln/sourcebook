import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { collectTags, removeTagFrom, renameTagIn } from './tags.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

const later = '2026-08-13T09:30:00.000Z';

describe('collectTags', () => {
  it('returns nothing when no record is tagged', () => {
    expect(collectTags([recruiter()])).toEqual([]);
  });

  it('counts how many records carry each tag', () => {
    const tags = collectTags([
      recruiter({ id: 'a', tags: ['fintech', 'remote'] }),
      recruiter({ id: 'b', tags: ['fintech'] }),
    ]);

    expect(tags).toEqual([
      { tag: 'fintech', count: 2 },
      { tag: 'remote', count: 1 },
    ]);
  });

  it('orders by how much a tag is used, then alphabetically', () => {
    // The management list is for finding the tag that got away from you, and
    // that is nearly always one of the heavily used ones.
    const tags = collectTags([
      recruiter({ id: 'a', tags: ['zebra', 'alpha', 'common'] }),
      recruiter({ id: 'b', tags: ['common'] }),
    ]);

    expect(tags.map((t) => t.tag)).toEqual(['common', 'alpha', 'zebra']);
  });

  it('counts a tag repeated inside one record once', () => {
    // The count is "records carrying this tag". Counting occurrences would
    // promise a delete affects three records when it affects one.
    expect(collectTags([recruiter({ tags: ['fintech', 'fintech'] })])).toEqual([
      { tag: 'fintech', count: 1 },
    ]);
  });

  it('ignores a blank tag rather than offering an unnameable row', () => {
    expect(collectTags([recruiter({ tags: ['  ', '', 'real'] })])).toEqual([
      { tag: 'real', count: 1 },
    ]);
  });
});

describe('renameTagIn', () => {
  it('leaves a record without the tag alone', () => {
    // `null` means "no write needed". Rewriting every record would burn the
    // 120-writes-per-minute budget on data that did not change.
    expect(renameTagIn(recruiter({ tags: ['other'] }), 'fintech', 'finance', later)).toBeNull();
  });

  it('renames the tag in place', () => {
    const changed = renameTagIn(recruiter({ tags: ['a', 'fintech', 'z'] }), 'fintech', 'finance', later);

    expect(changed?.tags).toEqual(['a', 'finance', 'z']);
  });

  it('merges into a tag the record already has, without duplicating it', () => {
    // Merging two tags into one is the main reason to rename at all.
    const changed = renameTagIn(
      recruiter({ tags: ['finance', 'fintech'] }),
      'fintech',
      'finance',
      later,
    );

    expect(changed?.tags).toEqual(['finance']);
  });

  it('trims the new name', () => {
    const changed = renameTagIn(recruiter({ tags: ['fintech'] }), 'fintech', '  finance  ', later);

    expect(changed?.tags).toEqual(['finance']);
  });

  it('treats renaming a tag to itself as no change', () => {
    expect(renameTagIn(recruiter({ tags: ['fintech'] }), 'fintech', 'fintech', later)).toBeNull();
  });

  it('matches exactly, so differing case is a rename rather than a no-op', () => {
    // "Fintech" and "fintech" are two tags the user wants merged; a
    // case-insensitive match would make that merge impossible to express.
    const changed = renameTagIn(recruiter({ tags: ['Fintech'] }), 'Fintech', 'fintech', later);

    expect(changed?.tags).toEqual(['fintech']);
  });

  it('marks the record as changed', () => {
    const changed = renameTagIn(recruiter({ tags: ['fintech'] }), 'fintech', 'finance', later);

    expect(changed?.updatedAt).toBe(later);
    expect(changed?.savedAt).toBe('2026-08-12T10:00:00.000Z');
  });

  it('does not mutate the record it was given', () => {
    const original = recruiter({ tags: ['fintech'] });
    renameTagIn(original, 'fintech', 'finance', later);

    expect(original.tags).toEqual(['fintech']);
  });
});

describe('removeTagFrom', () => {
  it('leaves a record without the tag alone', () => {
    expect(removeTagFrom(recruiter({ tags: ['other'] }), 'fintech', later)).toBeNull();
  });

  it('removes the tag and keeps the rest in order', () => {
    const changed = removeTagFrom(recruiter({ tags: ['a', 'fintech', 'z'] }), 'fintech', later);

    expect(changed?.tags).toEqual(['a', 'z']);
  });

  it('removes every copy when a record carries the tag twice', () => {
    const changed = removeTagFrom(recruiter({ tags: ['fintech', 'fintech'] }), 'fintech', later);

    expect(changed?.tags).toEqual([]);
  });

  it('marks the record as changed', () => {
    const changed = removeTagFrom(recruiter({ tags: ['fintech'] }), 'fintech', later);

    expect(changed?.updatedAt).toBe(later);
  });

  it('does not mutate the record it was given', () => {
    const original = recruiter({ tags: ['fintech'] });
    removeTagFrom(original, 'fintech', later);

    expect(original.tags).toEqual(['fintech']);
  });
});
