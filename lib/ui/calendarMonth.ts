/**
 * Month-grid arithmetic for the follow-up calendar.
 *
 * Kept pure and string-in/string-out so it can be tested without a DOM, and so
 * it speaks the same `YYYY-MM-DD` currency as the rest of the app. Follow-ups
 * are calendar dates rather than timestamps, and `followUp.ts` explains why: a
 * time would imply a precision the feature does not have.
 *
 * All arithmetic runs at UTC midnight. Adding a day to a local `Date` across a
 * daylight-saving boundary can land on the same date twice or skip one, which
 * would make the grid quietly wrong twice a year.
 */

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  iso: string;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
}

export interface Weekday {
  /** One or two letters for the column header. */
  short: string;
  /** The full name, for screen readers, since "T" and "S" each appear twice. */
  full: string;
}

/**
 * Monday-first, matching most of the world and the agreed design.
 *
 * Not derived from the locale: `Intl.Locale`'s week info is still patchy across
 * browsers, and a grid that silently shifts its first column depending on the
 * host is harder to trust than one that is consistently Monday.
 */
export const WEEKDAYS: readonly Weekday[] = [
  { short: 'M', full: 'Monday' },
  { short: 'T', full: 'Tuesday' },
  { short: 'W', full: 'Wednesday' },
  { short: 'T', full: 'Thursday' },
  { short: 'F', full: 'Friday' },
  { short: 'S', full: 'Saturday' },
  { short: 'S', full: 'Sunday' },
];

/** Six weeks, always. A grid that changes height as you page months jumps. */
export const WEEKS_SHOWN = 6;

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface IsoParts {
  year: number;
  /** 1-12, not the zero-based month `Date` uses. */
  month: number;
  day: number;
}

export function isoParts(iso: string): IsoParts {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

export function toIso({ year, month, day }: IsoParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True for a string this module can work with. Anything else is treated as unset. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value));
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

/**
 * Adds whole months, clamping the day rather than overflowing.
 *
 * 31 January plus one month is 28 February, not 3 March. Overflowing would make
 * paging forward and back again land somewhere new, which feels broken.
 */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = isoParts(iso);

  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;

  return toIso({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/**
 * The six-week block containing the given month.
 *
 * Leading and trailing days are real, selectable dates rather than blanks: they
 * are how you reach the 1st of next month without paging, and a grid with holes
 * in it is harder to navigate by keyboard.
 */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = toIso({ year, month, day: 1 });

  // getUTCDay is Sunday-first; shift so Monday is 0.
  const offset = (new Date(toUtc(first)).getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);

  return Array.from({ length: WEEKS_SHOWN * 7 }, (_, index) => {
    const iso = addDays(start, index);
    const parts = isoParts(iso);

    return {
      iso,
      dayOfMonth: parts.day,
      inMonth: parts.year === year && parts.month === month,
    };
  });
}

/** Splits a flat grid into weeks, for one `role="row"` each. */
export function toWeeks(days: CalendarDay[]): CalendarDay[][] {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, week) =>
    days.slice(week * 7, week * 7 + 7),
  );
}

function utcDate(iso: string): Date {
  return new Date(toUtc(iso));
}

/** "September 2026", for the calendar header. */
export function monthLabel(year: number, month: number): string {
  return utcDate(toIso({ year, month, day: 1 })).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Sat 12 Sep 2026", for the trigger and for a day's accessible name. */
export function fullDateLabel(iso: string): string {
  return utcDate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
