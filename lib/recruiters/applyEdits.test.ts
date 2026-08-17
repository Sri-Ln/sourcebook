import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { applyEdits, toEditValues, type EditValues } from './applyEdits.js';

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

function values(overrides: Partial<EditValues> = {}): EditValues {
  return {
    company: 'Stripe',
    note: 'Original note',
    tags: ['fintech'],
    followUpAt: '',
    ...overrides,
  };
}

const LATER = new Date('2026-09-01T12:00:00.000Z');

describe('toEditValues', () => {
  it('seeds the four editable fields from the record', () => {
    expect(toEditValues(recruiter())).toEqual({
      company: 'Stripe',
      note: 'Original note',
      tags: ['fintech'],
      followUpAt: '',
    });
  });

  it('turns missing optional fields into blanks the form can render', () => {
    const seeded = toEditValues(recruiter({ company: undefined, note: undefined }));

    expect(seeded.company).toBe('');
    expect(seeded.note).toBe('');
  });

  it('carries an existing follow-up date through', () => {
    expect(toEditValues(recruiter({ followUpAt: '2026-09-15' })).followUpAt).toBe('2026-09-15');
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
    // The one extracted field still worth editing: company is the axis the list
    // is grouped by, so a wrong one files someone where you cannot find them.
    const updated = applyEdits(recruiter(), values({ company: 'Postman' }));

    expect(updated.company).toBe('Postman');
  });

  /**
   * The form stopped offering these, so it has nothing to say about them.
   *
   * This is the failure mode the change had to avoid: run them through the same
   * "blank means omit" rule as the editable fields and every note correction
   * would silently delete a headline.
   */
  describe('fields the form no longer offers', () => {
    it('preserves the name', () => {
      expect(applyEdits(recruiter(), values()).name).toBe('Jane Placeholder');
    });

    it('preserves the headline', () => {
      expect(applyEdits(recruiter(), values()).headline).toBe('Technical Recruiter');
    });

    it('preserves the headline even when only the note changed', () => {
      const updated = applyEdits(recruiter(), values({ note: 'Something new' }));

      expect(updated.headline).toBe('Technical Recruiter');
    });

    it('preserves a source that carries a link', () => {
      const found = recruiter({ source: { type: 'post', url: 'https://example.com/post' } });

      const updated = applyEdits(found, values({ note: 'changed' }));

      expect(updated.source).toEqual({ type: 'post', url: 'https://example.com/post' });
    });

    it('preserves a bare source type', () => {
      expect(applyEdits(recruiter(), values()).source).toEqual({ type: 'profile' });
    });

    it('does not invent a headline for a record that never had one', () => {
      const updated = applyEdits(recruiter({ headline: undefined }), values());

      expect('headline' in updated).toBe(false);
    });
  });

  describe('clearing a field', () => {
    it('omits a cleared note', () => {
      const updated = applyEdits(recruiter(), values({ note: '' }));

      expect('note' in updated).toBe(false);
    });

    it('omits a cleared company', () => {
      const updated = applyEdits(recruiter(), values({ company: '' }));

      expect('company' in updated).toBe(false);
    });

    it('omits a company cleared to whitespace', () => {
      const updated = applyEdits(recruiter(), values({ company: '   ' }));

      expect('company' in updated).toBe(false);
    });
  });

  describe('identity is preserved', () => {
    it('keeps id, profileUrl, memberId and savedAt', () => {
      const original = recruiter();

      const updated = applyEdits(original, values({ note: 'changed' }), LATER);

      // Changing any of these would orphan the record from the person it
      // describes, or create a duplicate dedupe could no longer catch.
      expect(updated.id).toBe(original.id);
      expect(updated.profileUrl).toBe(original.profileUrl);
      expect(updated.memberId).toBe(original.memberId);
      expect(updated.savedAt).toBe(original.savedAt);
    });

    it('keeps outreach status, which is edited elsewhere', () => {
      expect(applyEdits(recruiter({ outreach: 'referred' }), values()).outreach).toBe('referred');
    });

    it('does not invent a memberId for a record that never had one', () => {
      const updated = applyEdits(recruiter({ memberId: undefined }), values());

      expect('memberId' in updated).toBe(false);
    });
  });

  describe('follow-up date', () => {
    it('sets a reminder date', () => {
      const updated = applyEdits(recruiter(), values({ followUpAt: '2026-09-15' }));

      expect(updated.followUpAt).toBe('2026-09-15');
    });

    it('omits the field when no date is set', () => {
      const updated = applyEdits(recruiter(), values({ followUpAt: '' }));

      expect('followUpAt' in updated).toBe(false);
    });

    it('clears an existing reminder', () => {
      const scheduled = recruiter({ followUpAt: '2026-09-15' });

      const updated = applyEdits(scheduled, values({ followUpAt: '' }));

      // Being unable to cancel a reminder would make people avoid setting one.
      expect('followUpAt' in updated).toBe(false);
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
