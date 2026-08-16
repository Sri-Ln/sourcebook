import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import type { SavePanelValues } from '../ui/savePanel.js';
import { applyEdits, toPanelValues } from './applyEdits.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'jane',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    memberId: 'ACoAAEXAMPLE',
    headline: 'Technical Recruiter',
    company: 'Stripe',
    outreach: 'messaged',
    source: { type: 'profile' },
    tags: ['fintech'],
    note: 'Original note',
    savedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function values(overrides: Partial<SavePanelValues> = {}): SavePanelValues {
  return {
    name: 'Jane Placeholder',
    headline: 'Technical Recruiter',
    company: 'Stripe',
    sourceType: 'profile',
    sourceUrl: '',
    note: 'Original note',
    tags: ['fintech'],
    ...overrides,
  };
}

const LATER = new Date('2026-09-01T12:00:00.000Z');

describe('toPanelValues', () => {
  it('seeds every editable field from the record', () => {
    expect(toPanelValues(recruiter())).toMatchObject({
      name: 'Jane Placeholder',
      headline: 'Technical Recruiter',
      company: 'Stripe',
      note: 'Original note',
      tags: ['fintech'],
      sourceType: 'profile',
    });
  });

  it('turns missing optional fields into blanks the form can render', () => {
    const seeded = toPanelValues(
      recruiter({ headline: undefined, company: undefined, note: undefined }),
    );

    expect(seeded.headline).toBe('');
    expect(seeded.company).toBe('');
    expect(seeded.note).toBe('');
  });
});

describe('applyEdits', () => {
  it('writes the note, which nothing else in the app can', () => {
    const updated = applyEdits(recruiter(), values({ note: 'Posted about backend openings' }));

    expect(updated.note).toBe('Posted about backend openings');
  });

  it('writes tags', () => {
    const updated = applyEdits(recruiter(), values({ tags: ['fintech', 'sponsors-h1b'] }));

    expect(updated.tags).toEqual(['fintech', 'sponsors-h1b']);
  });

  it('drops duplicate tags', () => {
    const updated = applyEdits(recruiter(), values({ tags: ['fintech', 'fintech', ' fintech '] }));

    expect(updated.tags).toEqual(['fintech']);
  });

  it('corrects a company the extractor guessed wrong', () => {
    // Extraction reads the line below the headline, which is a school for
    // anyone with no current employer. This is the fix for that.
    const updated = applyEdits(recruiter(), values({ company: 'Postman' }));

    expect(updated.company).toBe('Postman');
  });

  it('records that someone was found through a post', () => {
    const updated = applyEdits(
      recruiter(),
      values({ sourceType: 'post', sourceUrl: 'https://www.linkedin.com/posts/abc' }),
    );

    expect(updated.source).toEqual({
      type: 'post',
      url: 'https://www.linkedin.com/posts/abc',
    });
  });

  it('drops a source link that no longer applies', () => {
    const saved = recruiter({ source: { type: 'post', url: 'https://example.com/post' } });

    const updated = applyEdits(saved, values({ sourceType: 'profile', sourceUrl: '' }));

    // Keeping a stale post URL against "their profile" would be a quiet lie
    // about where someone came from.
    expect(updated.source).toEqual({ type: 'profile' });
  });

  describe('clearing a field', () => {
    it('omits a cleared headline rather than storing an empty string', () => {
      const updated = applyEdits(recruiter(), values({ headline: '   ' }));

      expect('headline' in updated).toBe(false);
    });

    it('omits a cleared note', () => {
      const updated = applyEdits(recruiter(), values({ note: '' }));

      expect('note' in updated).toBe(false);
    });

    it('omits a cleared company', () => {
      const updated = applyEdits(recruiter(), values({ company: '' }));

      expect('company' in updated).toBe(false);
    });
  });

  describe('identity is preserved', () => {
    it('keeps id, profileUrl, memberId and savedAt', () => {
      const original = recruiter();

      const updated = applyEdits(original, values({ name: 'Renamed Person' }), LATER);

      // Changing any of these would orphan the record from the person it
      // describes, or create a duplicate dedupe could no longer catch.
      expect(updated.id).toBe(original.id);
      expect(updated.profileUrl).toBe(original.profileUrl);
      expect(updated.memberId).toBe(original.memberId);
      expect(updated.savedAt).toBe(original.savedAt);
    });

    it('keeps outreach status, which is edited elsewhere', () => {
      expect(applyEdits(recruiter({ outreach: 'replied' }), values()).outreach).toBe('replied');
    });

    it('falls back to the stored name rather than wiping it', () => {
      expect(applyEdits(recruiter(), values({ name: '   ' })).name).toBe('Jane Placeholder');
    });

    it('does not invent a memberId for a record that never had one', () => {
      const updated = applyEdits(recruiter({ memberId: undefined }), values());

      expect('memberId' in updated).toBe(false);
    });
  });

  it('advances updatedAt', () => {
    const updated = applyEdits(recruiter(), values({ note: 'changed' }), LATER);

    expect(updated.updatedAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('does not mutate the original', () => {
    const original = recruiter();

    applyEdits(original, values({ note: 'changed', tags: [] }));

    expect(original.note).toBe('Original note');
    expect(original.tags).toEqual(['fintech']);
  });
});
