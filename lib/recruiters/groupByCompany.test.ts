import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { UNKNOWN_COMPANY, groupByCompany } from './groupByCompany.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('groupByCompany', () => {
  it('groups people at the same company together', () => {
    const groups = groupByCompany([
      recruiter({ name: 'A', company: 'Stripe' }),
      recruiter({ name: 'B', company: 'Postman' }),
      recruiter({ name: 'C', company: 'Stripe' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.company === 'Stripe')?.recruiters).toHaveLength(2);
  });

  it('orders companies alphabetically', () => {
    const groups = groupByCompany([
      recruiter({ company: 'Stripe' }),
      recruiter({ company: 'Airtable' }),
      recruiter({ company: 'Postman' }),
    ]);

    expect(groups.map((g) => g.company)).toEqual(['Airtable', 'Postman', 'Stripe']);
  });

  it('sorts case-insensitively so lowercase names are not exiled to the end', () => {
    const groups = groupByCompany([
      recruiter({ company: 'Zapier' }),
      recruiter({ company: 'airtable' }),
    ]);

    expect(groups.map((g) => g.company)).toEqual(['airtable', 'Zapier']);
  });

  describe('matching', () => {
    it('treats differing case as the same company', () => {
      const groups = groupByCompany([
        recruiter({ company: 'Stripe' }),
        recruiter({ company: 'stripe' }),
      ]);

      expect(groups).toHaveLength(1);
    });

    it('ignores surrounding whitespace', () => {
      const groups = groupByCompany([
        recruiter({ company: 'Stripe' }),
        recruiter({ company: ' Stripe ' }),
      ]);

      expect(groups).toHaveLength(1);
    });

    it('keeps the first spelling seen rather than lowercasing the label', () => {
      // "STRIPE" is not how anyone writes it, and neither is "stripe".
      const groups = groupByCompany([
        recruiter({ company: 'Stripe' }),
        recruiter({ company: 'STRIPE' }),
      ]);

      expect(groups[0]?.company).toBe('Stripe');
    });
  });

  describe('unknown company', () => {
    it('collects records with no company', () => {
      const groups = groupByCompany([recruiter({ company: undefined }), recruiter({ company: '' })]);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.company).toBe(UNKNOWN_COMPANY);
      expect(groups[0]?.recruiters).toHaveLength(2);
    });

    it('keeps unknowns last, whatever the alphabet says', () => {
      // "No company" would otherwise sort between Airtable and Stripe and push
      // the least useful group into the middle of the list.
      const groups = groupByCompany([
        recruiter({ company: undefined }),
        recruiter({ company: 'Stripe' }),
        recruiter({ company: 'Airtable' }),
      ]);

      expect(groups.map((g) => g.company)).toEqual(['Airtable', 'Stripe', UNKNOWN_COMPANY]);
    });

    it('treats whitespace-only as unknown', () => {
      const groups = groupByCompany([recruiter({ company: '   ' })]);

      expect(groups[0]?.company).toBe(UNKNOWN_COMPANY);
    });
  });

  it('puts the most recently saved person first within a company', () => {
    const groups = groupByCompany([
      recruiter({ name: 'Older', company: 'Stripe', savedAt: '2026-01-01T00:00:00.000Z' }),
      recruiter({ name: 'Newer', company: 'Stripe', savedAt: '2026-08-01T00:00:00.000Z' }),
    ]);

    expect(groups[0]?.recruiters.map((r) => r.name)).toEqual(['Newer', 'Older']);
  });

  it('does not mutate the input', () => {
    const input = [recruiter({ company: 'B' }), recruiter({ company: 'A' })];
    const before = input.map((r) => r.company);

    groupByCompany(input);

    expect(input.map((r) => r.company)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(groupByCompany([])).toEqual([]);
  });
});
