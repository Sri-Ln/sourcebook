import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { dueLabel, dueRecruiters, isDue, isScheduled, todayIso } from './followUp.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    outreach: 'messaged',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Local noon, so the date is unambiguous whatever the runner's zone. */
const on = (date: string) => new Date(`${date}T12:00:00`);

describe('todayIso', () => {
  it('uses local date parts, not UTC', () => {
    // 11pm on the 3rd is already the 4th in UTC. Using UTC would make a
    // reminder look overdue a day early for anyone west of Greenwich.
    const lateEvening = new Date(2026, 8, 3, 23, 30);

    expect(todayIso(lateEvening)).toBe('2026-09-03');
  });

  it('pads month and day', () => {
    expect(todayIso(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('isDue', () => {
  it('is false when no follow-up is set', () => {
    expect(isDue(recruiter(), on('2026-09-01'))).toBe(false);
  });

  it('is true on the day itself', () => {
    expect(isDue(recruiter({ followUpAt: '2026-09-01' }), on('2026-09-01'))).toBe(true);
  });

  it('is true once the day has passed', () => {
    expect(isDue(recruiter({ followUpAt: '2026-08-20' }), on('2026-09-01'))).toBe(true);
  });

  it('is false before the day', () => {
    expect(isDue(recruiter({ followUpAt: '2026-09-05' }), on('2026-09-01'))).toBe(false);
  });
});

describe('isScheduled', () => {
  it('distinguishes a future follow-up from none at all', () => {
    expect(isScheduled(recruiter({ followUpAt: '2026-12-01' }))).toBe(true);
    expect(isScheduled(recruiter())).toBe(false);
  });
});

describe('dueRecruiters', () => {
  it('returns only those due, soonest first', () => {
    const people = [
      recruiter({ name: 'Later', followUpAt: '2026-08-30' }),
      recruiter({ name: 'Not yet', followUpAt: '2026-12-01' }),
      recruiter({ name: 'Earlier', followUpAt: '2026-08-10' }),
      recruiter({ name: 'Unscheduled' }),
    ];

    const due = dueRecruiters(people, on('2026-09-01'));

    expect(due.map((r) => r.name)).toEqual(['Earlier', 'Later']);
  });

  it('returns nothing when none are due', () => {
    expect(dueRecruiters([recruiter({ followUpAt: '2027-01-01' })], on('2026-09-01'))).toEqual([]);
  });
});

describe('dueLabel', () => {
  const today = on('2026-09-01');

  it('says Overdue for a date already passed', () => {
    expect(dueLabel('2026-08-25', today)).toBe('Overdue');
  });

  it('says Today on the day', () => {
    expect(dueLabel('2026-09-01', today)).toBe('Today');
  });

  it('says Tomorrow for the next day', () => {
    expect(dueLabel('2026-09-02', today)).toBe('Tomorrow');
  });

  it('counts days within the coming week', () => {
    expect(dueLabel('2026-09-04', today)).toBe('in 3 days');
    expect(dueLabel('2026-09-08', today)).toBe('in 7 days');
  });

  it('switches to a date beyond a week', () => {
    // "in 23 days" is harder to act on than the date itself.
    expect(dueLabel('2026-09-24', today)).toMatch(/Sep/);
    expect(dueLabel('2026-09-24', today)).not.toMatch(/in \d+ days/);
  });

  it('handles a month boundary', () => {
    expect(dueLabel('2026-10-01', on('2026-09-28'))).toBe('in 3 days');
  });
});
