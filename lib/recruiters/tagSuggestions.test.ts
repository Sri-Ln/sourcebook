import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import {
  MATCH_LIMIT,
  RESTING_LIMIT,
  activeFragment,
  filterChipTags,
  rankTags,
  suggestTags,
  withTag,
} from './tagSuggestions.js';

let counter = 0;
function recruiter(tags: string[]): Recruiter {
  counter += 1;
  return {
    id: `r${counter}`,
    schemaVersion: SCHEMA_VERSION,
    name: `Person ${counter}`,
    profileUrl: `https://www.linkedin.com/in/person-${counter}`,
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags,
    savedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
}

describe('rankTags', () => {
  it('has nothing to offer before anything is tagged', () => {
    // Day one. The feature is a view over your own tags, so it starts empty.
    expect(rankTags([])).toEqual([]);
    expect(rankTags([recruiter([])])).toEqual([]);
  });

  it('puts the most-used tag first', () => {
    const ranked = rankTags([
      recruiter(['fintech', 'backend']),
      recruiter(['fintech']),
      recruiter(['fintech', 'backend']),
      recruiter(['seed-stage']),
    ]);

    expect(ranked).toEqual(['fintech', 'backend', 'seed-stage']);
  });

  it('breaks ties alphabetically rather than by save order', () => {
    // Otherwise the row reshuffles as you save people, for no reason you can see.
    expect(rankTags([recruiter(['zebra']), recruiter(['alpha'])])).toEqual(['alpha', 'zebra']);
  });

  it('treats one tag written two ways as one tag', () => {
    const ranked = rankTags([recruiter(['fintech']), recruiter(['Fintech'])]);

    // Offering both spellings would encourage exactly the split this should be
    // helping to avoid.
    expect(ranked).toHaveLength(1);
  });

  it('offers the spelling used most often', () => {
    const ranked = rankTags([
      recruiter(['Fintech']),
      recruiter(['fintech']),
      recruiter(['fintech']),
    ]);

    expect(ranked).toEqual(['fintech']);
  });

  it('ignores blank and whitespace-only tags', () => {
    expect(rankTags([recruiter(['  ', '', 'real'])])).toEqual(['real']);
  });

  it('trims what it reports', () => {
    expect(rankTags([recruiter(['  spaced  '])])).toEqual(['spaced']);
  });
});

describe('activeFragment', () => {
  it('is empty for an empty field', () => {
    expect(activeFragment('')).toBe('');
  });

  it('is the whole value while typing the first tag', () => {
    expect(activeFragment('fin')).toBe('fin');
  });

  it('is only what follows the last comma', () => {
    // This is why a native <datalist> cannot do the job: it would match against
    // "fintech, spo" as a whole and find nothing.
    expect(activeFragment('fintech, spo')).toBe('spo');
  });

  it('is empty just after a comma, so the row goes back to resting', () => {
    expect(activeFragment('fintech, ')).toBe('');
    expect(activeFragment('fintech,')).toBe('');
  });
});

describe('suggestTags', () => {
  const ranked = ['fintech', 'backend', 'seed-stage', 'sponsors-h1b', 'warm-intro', 'remote'];

  it('offers only the top few at rest', () => {
    const offered = suggestTags({ ranked, applied: [], fragment: '' });

    // Twenty chips is not a shortcut.
    expect(offered).toEqual(['fintech', 'backend', 'seed-stage']);
    expect(offered).toHaveLength(RESTING_LIMIT);
  });

  it('never offers a tag already on the record', () => {
    const offered = suggestTags({ ranked, applied: ['fintech'], fragment: '' });

    expect(offered).not.toContain('fintech');
    expect(offered).toEqual(['backend', 'seed-stage', 'sponsors-h1b']);
  });

  it('ignores case when deciding what is already applied', () => {
    expect(suggestTags({ ranked, applied: ['FinTech'], fragment: '' })).not.toContain('fintech');
  });

  it('reaches past the top few once something is typed', () => {
    // The point of the fragment mode: warm-intro is fifth and unreachable at
    // rest, but two keystrokes find it.
    expect(suggestTags({ ranked, applied: [], fragment: 'warm' })).toEqual(['warm-intro']);
  });

  it('matches on a substring, not just the start', () => {
    expect(suggestTags({ ranked, applied: [], fragment: 'h1b' })).toEqual(['sponsors-h1b']);
  });

  it('puts a prefix match ahead of a more-used substring match', () => {
    const offered = suggestTags({
      // 'ex-sponsor' is the more-used tag, but only contains the fragment.
      ranked: ['ex-sponsor', 'sponsors-h1b'],
      applied: [],
      fragment: 'sponsor',
    });

    // Typing "sponsor" means heading for something that starts that way, and
    // burying it under a substring hit reads as broken.
    expect(offered).toEqual(['sponsors-h1b', 'ex-sponsor']);
  });

  it('ignores case when matching', () => {
    expect(suggestTags({ ranked, applied: [], fragment: 'FIN' })).toEqual(['fintech']);
  });

  it('offers more while typing than at rest, since the list is doing real work', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag-${i}`);

    expect(suggestTags({ ranked: many, applied: [], fragment: 'tag' })).toHaveLength(MATCH_LIMIT);
  });

  it('offers nothing when the fragment matches nothing', () => {
    expect(suggestTags({ ranked, applied: [], fragment: 'zzz' })).toEqual([]);
  });

  it('offers nothing when every tag is already applied', () => {
    expect(suggestTags({ ranked, applied: ranked, fragment: '' })).toEqual([]);
  });
});

describe('filterChipTags', () => {
  const ranked = ['fintech', 'backend', 'seed-stage', 'sponsors-h1b', 'warm-intro'];

  it('caps the row at three', () => {
    // The row used to grow with the collection: twenty tags meant twenty chips
    // above a list of four people.
    expect(filterChipTags({ ranked, selected: [] })).toEqual([
      'fintech',
      'backend',
      'seed-stage',
    ]);
  });

  it('offers nothing before any tags exist', () => {
    expect(filterChipTags({ ranked: [], selected: [] })).toEqual([]);
  });

  it('shows fewer than three when that is all there is', () => {
    expect(filterChipTags({ ranked: ['solo'], selected: [] })).toEqual(['solo']);
  });

  it('keeps a selected tag that falls outside the top three', () => {
    const shown = filterChipTags({ ranked, selected: ['warm-intro'] });

    // Dropping it would leave a filter applied with no way to switch it off, and
    // the list would look broken with no explanation.
    expect(shown).toContain('warm-intro');
    expect(shown).toEqual(['fintech', 'backend', 'seed-stage', 'warm-intro']);
  });

  it('does not duplicate a selected tag already in the top three', () => {
    expect(filterChipTags({ ranked, selected: ['backend'] })).toEqual([
      'fintech',
      'backend',
      'seed-stage',
    ]);
  });

  it('matches selection case-insensitively when deciding on duplicates', () => {
    expect(filterChipTags({ ranked, selected: ['BackEnd'] })).toHaveLength(3);
  });

  it('keeps the top three in place when a held tag is appended', () => {
    const shown = filterChipTags({ ranked, selected: ['warm-intro', 'sponsors-h1b'] });

    // Appended rather than merged, so the row does not reshuffle as filters go
    // on and off.
    expect(shown.slice(0, 3)).toEqual(['fintech', 'backend', 'seed-stage']);
    expect(shown.slice(3).sort()).toEqual(['sponsors-h1b', 'warm-intro']);
  });

  it('honours a different limit', () => {
    expect(filterChipTags({ ranked, selected: [], limit: 1 })).toEqual(['fintech']);
  });
});

describe('withTag', () => {
  it('appends to an empty field', () => {
    expect(withTag('', 'fintech')).toBe('fintech, ');
  });

  it('completes the tag being typed rather than duplicating it', () => {
    // Clicking "sponsors-h1b" while "spo" is typed must not leave "spo" behind.
    expect(withTag('fintech, spo', 'sponsors-h1b')).toBe('fintech, sponsors-h1b, ');
  });

  it('appends after a finished list', () => {
    expect(withTag('fintech, ', 'backend')).toBe('fintech, backend, ');
    expect(withTag('fintech,', 'backend')).toBe('fintech, backend, ');
  });

  it('replaces a part-typed first tag', () => {
    expect(withTag('fin', 'fintech')).toBe('fintech, ');
  });

  it('keeps earlier tags untouched', () => {
    expect(withTag('a, b, c', 'd')).toBe('a, b, d, ');
  });

  it('leaves a trailing separator so the next tag can be typed straight away', () => {
    // It also returns the suggestion row to resting, rather than matching the
    // tag that was just accepted.
    expect(withTag('', 'fintech').endsWith(', ')).toBe(true);
    expect(activeFragment(withTag('', 'fintech'))).toBe('');
  });
});
