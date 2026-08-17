import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { findSaved, profileKey } from './findSaved.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'existing',
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

describe('profileKey', () => {
  it('reduces the forms of one profile URL to the same key', () => {
    const expected = '/in/jane-placeholder';

    // What the extractor produces, what the address bar holds, and what an
    // older or imported record might carry.
    expect(profileKey('https://www.linkedin.com/in/jane-placeholder')).toBe(expected);
    expect(profileKey('https://www.linkedin.com/in/jane-placeholder/')).toBe(expected);
    expect(profileKey('https://linkedin.com/in/Jane-Placeholder')).toBe(expected);
    expect(profileKey('/in/jane-placeholder')).toBe(expected);
  });

  it('ignores the tracking parameters a real tab URL carries', () => {
    expect(
      profileKey('https://www.linkedin.com/in/jane-placeholder/?originalSubdomain=uk&trk=feed'),
    ).toBe('/in/jane-placeholder');
  });

  it('keeps the profile key for a subpage of that profile', () => {
    // The content script mounts on these too, so the button has to recognise
    // the person while you are reading their activity.
    expect(profileKey('https://www.linkedin.com/in/jane-placeholder/recent-activity/all/')).toBe(
      '/in/jane-placeholder',
    );
  });

  it('returns nothing usable for anything that is not a profile', () => {
    expect(profileKey(undefined)).toBe('');
    expect(profileKey('')).toBe('');
    expect(profileKey('not a url at all')).toBe('');
    expect(profileKey('https://www.linkedin.com/feed/')).toBe('');
    expect(profileKey('https://www.linkedin.com/in/')).toBe('');
  });
});

describe('findSaved', () => {
  it('finds nothing in an empty store', () => {
    expect(findSaved([], { memberId: 'ACoAAEXAMPLE' })).toBeUndefined();
  });

  it('matches on memberId even when the vanity URL has changed', () => {
    const jane = recruiter({
      memberId: 'ACoAAEXAMPLE',
      profileUrl: 'https://www.linkedin.com/in/jane-old-slug',
    });

    expect(
      findSaved([jane], {
        memberId: 'ACoAAEXAMPLE',
        profileUrl: 'https://www.linkedin.com/in/jane-new-slug',
      }),
    ).toBe(jane);
  });

  it('falls back to the URL when there is no id to match on', () => {
    // The side panel only ever has this: reading an id means reaching into the
    // page, and the panel is not in the page.
    const jane = recruiter();

    expect(findSaved([jane], { profileUrl: 'https://www.linkedin.com/in/jane-placeholder/' })).toBe(
      jane,
    );
  });

  it('prefers the id match over a different person at a colliding URL', () => {
    const byUrl = recruiter({ id: 'by-url', memberId: undefined });
    const byId = recruiter({
      id: 'by-id',
      memberId: 'ACoAAEXAMPLE',
      profileUrl: 'https://www.linkedin.com/in/somewhere-else',
    });

    expect(
      findSaved([byUrl, byId], {
        memberId: 'ACoAAEXAMPLE',
        profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
      }),
    ).toBe(byId);
  });

  it('does not pair up two records that simply have no URL', () => {
    // An empty key matching an empty key would report a random unrelated
    // record as "already saved" and disable the button for it.
    const noUrl = recruiter({ profileUrl: undefined, memberId: undefined });

    expect(findSaved([noUrl], { profileUrl: undefined })).toBeUndefined();
    expect(findSaved([noUrl], { profileUrl: 'https://www.linkedin.com/feed/' })).toBeUndefined();
  });

  it('does not match an undefined id against a record that has none', () => {
    const noId = recruiter({ memberId: undefined, profileUrl: undefined });

    expect(findSaved([noId], { memberId: undefined })).toBeUndefined();
  });
});
