import type { Recruiter } from '../models/types.js';

/**
 * Follow-ups are calendar dates, not timestamps.
 *
 * "Get back to her on Tuesday" is a day, not a moment. Storing a time would
 * imply a precision the feature does not have, and comparing timestamps across
 * time zones would make a reminder fire on the wrong day for anyone who
 * travels.
 */
export function todayIso(now = new Date()): string {
  // Local date parts, not toISOString(): at 11pm on the 3rd, UTC already says
  // the 4th, and the reminder would look overdue a day early.
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Due today or earlier. Dates are `YYYY-MM-DD`, so string order is date order. */
export function isDue(recruiter: Recruiter, now = new Date()): boolean {
  return recruiter.followUpAt !== undefined && recruiter.followUpAt <= todayIso(now);
}

export function isScheduled(recruiter: Recruiter): boolean {
  return recruiter.followUpAt !== undefined;
}

/** Everyone due, soonest first. */
export function dueRecruiters(recruiters: Recruiter[], now = new Date()): Recruiter[] {
  return recruiters
    .filter((recruiter) => isDue(recruiter, now))
    .sort((a, b) => (a.followUpAt ?? '').localeCompare(b.followUpAt ?? ''));
}

/**
 * A short human label for a card: "Today", "Overdue", "in 3 days", "12 Sep".
 *
 * Relative wording only near the present, where it is genuinely easier to read
 * than a date. Beyond a week "in 23 days" is harder to act on than the date
 * itself.
 */
export function dueLabel(followUpAt: string, now = new Date()): string {
  const today = todayIso(now);
  if (followUpAt < today) return 'Overdue';
  if (followUpAt === today) return 'Today';

  const days = daysBetween(today, followUpAt);
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `in ${days} days`;

  return new Date(`${followUpAt}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
