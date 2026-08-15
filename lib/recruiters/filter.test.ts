import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { EMPTY_FILTER, collectTags, filterRecruiters, isFiltering } from './filter.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    headline: 'Technical Recruiter at Placeholder Corp',
    company: 'Placeholder Corp',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('filterRecruiters', () => {
  it('returns everything when nothing is filtered', () => {
    const all = [recruiter(), recruiter()];

    expect(filterRecruiters(all, EMPTY_FILTER)).toHaveLength(2);
  });

  describe('search', () => {
    const all = [
      recruiter({ name: 'Ada Lovelace', company: 'Analytical Engines' }),
      recruiter({ name: 'Grace Hopper', company: 'Naval Systems', headline: 'Compilers' }),
      recruiter({ name: 'Alan Turing', note: 'posted about backend openings' }),
    ];

    it('matches on name', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'ada' })).toHaveLength(1);
    });

    it('is case insensitive', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'GRACE' })).toHaveLength(1);
    });

    it('matches on company', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'naval' })).toHaveLength(1);
    });

    it('matches on headline', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'compilers' })).toHaveLength(1);
    });

    it('matches on the note', () => {
      // What you remember months later is often the note, not the job title.
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'backend' })).toHaveLength(1);
    });

    it('matches on tags', () => {
      const tagged = [recruiter({ tags: ['fintech'] }), recruiter({ tags: ['gaming'] })];

      expect(filterRecruiters(tagged, { ...EMPTY_FILTER, query: 'fintech' })).toHaveLength(1);
    });

    it('narrows rather than widens as terms are added', () => {
      // A naive OR would return more results the more you typed, which is the
      // opposite of what typing more words means.
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'grace naval' })).toHaveLength(1);
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'grace engines' })).toHaveLength(0);
    });

    it('ignores surrounding whitespace', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: '   ada   ' })).toHaveLength(1);
    });

    it('returns nothing when a term matches nobody', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, query: 'nonexistent' })).toEqual([]);
    });

    it('tolerates records with missing optional fields', () => {
      const sparse = [recruiter({ headline: undefined, company: undefined, note: undefined })];

      expect(() => filterRecruiters(sparse, { ...EMPTY_FILTER, query: 'jane' })).not.toThrow();
      expect(filterRecruiters(sparse, { ...EMPTY_FILTER, query: 'jane' })).toHaveLength(1);
    });
  });

  describe('status', () => {
    const all = [
      recruiter({ outreach: 'not-contacted' }),
      recruiter({ outreach: 'messaged' }),
      recruiter({ outreach: 'replied' }),
    ];

    it('filters to one status', () => {
      // The filter that matters: who have I never reached out to?
      const result = filterRecruiters(all, { ...EMPTY_FILTER, statuses: ['not-contacted'] });

      expect(result).toHaveLength(1);
      expect(result[0]?.outreach).toBe('not-contacted');
    });

    it('filters to several statuses', () => {
      expect(
        filterRecruiters(all, { ...EMPTY_FILTER, statuses: ['messaged', 'replied'] }),
      ).toHaveLength(2);
    });
  });

  describe('tags', () => {
    const all = [
      recruiter({ tags: ['fintech', 'remote'] }),
      recruiter({ tags: ['gaming'] }),
      recruiter({ tags: [] }),
    ];

    it('matches any of the selected tags', () => {
      expect(filterRecruiters(all, { ...EMPTY_FILTER, tags: ['fintech'] })).toHaveLength(1);
      expect(filterRecruiters(all, { ...EMPTY_FILTER, tags: ['fintech', 'gaming'] })).toHaveLength(
        2,
      );
    });
  });

  it('combines search, status and tags', () => {
    const all = [
      recruiter({ name: 'Ada', outreach: 'messaged', tags: ['fintech'] }),
      recruiter({ name: 'Ada', outreach: 'not-contacted', tags: ['fintech'] }),
      recruiter({ name: 'Grace', outreach: 'messaged', tags: ['fintech'] }),
    ];

    const result = filterRecruiters(all, {
      query: 'ada',
      statuses: ['messaged'],
      tags: ['fintech'],
      due: false,
    });

    expect(result).toHaveLength(1);
  });
});

describe('collectTags', () => {
  it('lists every tag once, sorted', () => {
    const all = [recruiter({ tags: ['remote', 'fintech'] }), recruiter({ tags: ['fintech'] })];

    expect(collectTags(all)).toEqual(['fintech', 'remote']);
  });

  it('handles a list with no tags', () => {
    expect(collectTags([recruiter()])).toEqual([]);
  });
});

describe('isFiltering', () => {
  it('is false for an empty filter', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
  });

  it('ignores a whitespace-only query', () => {
    expect(isFiltering({ ...EMPTY_FILTER, query: '   ' })).toBe(false);
  });

  it('is true once anything is set', () => {
    expect(isFiltering({ ...EMPTY_FILTER, statuses: ['messaged'] })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, tags: ['fintech'] })).toBe(true);
  });
});
