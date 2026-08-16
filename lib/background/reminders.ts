import type { Recruiter } from '../models/types.js';
import { dueRecruiters, todayIso } from '../recruiters/followUp.js';

export const REMINDER_ALARM = 'follow-up-check';

/** Where the last notified date is remembered, so nobody is nagged twice. */
export const NOTIFIED_KEY = 'reminders:lastNotifiedOn';

export interface ReminderNotice {
  title: string;
  message: string;
  /** Ids the notice covers, so the panel can be filtered to them. */
  ids: string[];
}

/**
 * Decides whether to raise a notice, and what it should say.
 *
 * At most one notice per day, covering everyone due. Five separate
 * notifications for five people is not five times as useful — it is one useful
 * signal and four interruptions, and the reliable response to that is to turn
 * notifications off.
 *
 * Returns `null` when there is nothing to say, which includes the case where
 * today has already been notified.
 */
export function planReminder(
  recruiters: Recruiter[],
  lastNotifiedOn: string | undefined,
  now = new Date(),
): ReminderNotice | null {
  const today = todayIso(now);
  if (lastNotifiedOn === today) return null;

  const due = dueRecruiters(recruiters, now);
  if (due.length === 0) return null;

  const [first] = due;
  const others = due.length - 1;

  return {
    title: due.length === 1 ? 'One follow-up due' : `${due.length} follow-ups due`,
    message:
      others === 0
        ? `${first?.name}${first?.company ? ` at ${first.company}` : ''}`
        : `${first?.name} and ${others} other${others === 1 ? '' : 's'}`,
    ids: due.map((recruiter) => recruiter.id),
  };
}

/**
 * Milliseconds until the next local midnight.
 *
 * Anchoring to midnight rather than firing every N hours means the check
 * happens when the date actually changes, which is the only moment a follow-up
 * can become due.
 */
export function msUntilNextMidnight(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}
