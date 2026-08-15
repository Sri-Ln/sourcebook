import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { msUntilNextMidnight, planReminder } from './reminders.js';

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

const on = (date: string) => new Date(`${date}T09:00:00`);

describe('planReminder', () => {
  it('says nothing when nobody is due', () => {
    expect(planReminder([recruiter({ followUpAt: '2027-01-01' })], undefined, on('2026-09-01')))
      .toBeNull();
  });

  it('says nothing when no follow-ups are set at all', () => {
    expect(planReminder([recruiter()], undefined, on('2026-09-01'))).toBeNull();
  });

  it('names the person when one is due', () => {
    const notice = planReminder(
      [recruiter({ name: 'Ada Lovelace', company: 'Stripe', followUpAt: '2026-09-01' })],
      undefined,
      on('2026-09-01'),
    );

    expect(notice?.title).toBe('One follow-up due');
    expect(notice?.message).toBe('Ada Lovelace at Stripe');
  });

  it('copes with a person who has no company', () => {
    const notice = planReminder(
      [recruiter({ name: 'Ada Lovelace', company: undefined, followUpAt: '2026-09-01' })],
      undefined,
      on('2026-09-01'),
    );

    expect(notice?.message).toBe('Ada Lovelace');
  });

  it('summarises rather than raising one notice per person', () => {
    // Five notifications is not five times as useful as one; it is one useful
    // signal and four interruptions, and the reliable response is to switch
    // notifications off entirely.
    const notice = planReminder(
      [
        recruiter({ name: 'Ada', followUpAt: '2026-08-20' }),
        recruiter({ name: 'Grace', followUpAt: '2026-08-25' }),
        recruiter({ name: 'Alan', followUpAt: '2026-09-01' }),
      ],
      undefined,
      on('2026-09-01'),
    );

    expect(notice?.title).toBe('3 follow-ups due');
    // Soonest first, so the name shown is the one waiting longest.
    expect(notice?.message).toBe('Ada and 2 others');
    expect(notice?.ids).toHaveLength(3);
  });

  it('uses the singular for exactly one other', () => {
    const notice = planReminder(
      [
        recruiter({ name: 'Ada', followUpAt: '2026-08-20' }),
        recruiter({ name: 'Grace', followUpAt: '2026-08-25' }),
      ],
      undefined,
      on('2026-09-01'),
    );

    expect(notice?.message).toBe('Ada and 1 other');
  });

  it('includes overdue people, not just those due today', () => {
    const notice = planReminder(
      [recruiter({ name: 'Forgotten', followUpAt: '2026-07-01' })],
      undefined,
      on('2026-09-01'),
    );

    // A date that passed while the browser was closed must still surface, or
    // the reminder silently never happens.
    expect(notice).not.toBeNull();
  });

  it('does not notify twice on the same day', () => {
    const people = [recruiter({ followUpAt: '2026-09-01' })];

    expect(planReminder(people, '2026-09-01', on('2026-09-01'))).toBeNull();
  });

  it('notifies again the next day if still due', () => {
    const people = [recruiter({ followUpAt: '2026-09-01' })];

    expect(planReminder(people, '2026-09-01', on('2026-09-02'))).not.toBeNull();
  });
});

describe('msUntilNextMidnight', () => {
  it('counts the remainder of the day', () => {
    const elevenPm = new Date(2026, 8, 1, 23, 0, 0);

    expect(msUntilNextMidnight(elevenPm)).toBe(60 * 60 * 1000);
  });

  it('is a full day just after midnight', () => {
    const justAfter = new Date(2026, 8, 1, 0, 0, 0);

    expect(msUntilNextMidnight(justAfter)).toBe(24 * 60 * 60 * 1000);
  });

  it('is always positive', () => {
    // A non-positive delay would make the alarm fire immediately and loop.
    for (const hour of [0, 6, 12, 18, 23]) {
      expect(msUntilNextMidnight(new Date(2026, 8, 1, hour, 30))).toBeGreaterThan(0);
    }
  });
});
