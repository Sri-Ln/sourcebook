import { describe, expect, it } from 'vitest';
import {
  WEEKDAYS,
  WEEKS_SHOWN,
  addDays,
  addMonths,
  daysInMonth,
  fullDateLabel,
  isIsoDate,
  isoParts,
  monthGrid,
  monthLabel,
  toIso,
  toWeeks,
} from './calendarMonth.js';

describe('isoParts and toIso', () => {
  it('round-trips a date', () => {
    expect(toIso(isoParts('2026-09-12'))).toBe('2026-09-12');
  });

  it('pads single-digit months and days', () => {
    expect(toIso({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
  });
});

describe('isIsoDate', () => {
  it('accepts a calendar date', () => {
    expect(isIsoDate('2026-09-12')).toBe(true);
  });

  it('rejects anything the grid cannot work with', () => {
    // Stored values are untrusted like anything else on disk, and a bad one
    // must read as "no date" rather than crash the form open.
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate('12/09/2026')).toBe(false);
    expect(isIsoDate('2026-09-12T10:00:00Z')).toBe(false);
    expect(isIsoDate('2026-13-40')).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('knows leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    // Divisible by 100 but not 400, so not a leap year.
    expect(daysInMonth(2100, 2)).toBe(28);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('steps a week at a time', () => {
    expect(addDays('2026-09-12', 7)).toBe('2026-09-19');
    expect(addDays('2026-09-12', -7)).toBe('2026-09-05');
  });

  it('is unaffected by a daylight-saving boundary', () => {
    // US clocks go back on 1 November 2026. Local-time arithmetic here can
    // repeat or skip a date, which would make the grid wrong twice a year.
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    // And forward, in March.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('addMonths', () => {
  it('moves forward and back', () => {
    expect(addMonths('2026-09-12', 1)).toBe('2026-10-12');
    expect(addMonths('2026-09-12', -1)).toBe('2026-08-12');
  });

  it('crosses year boundaries', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('clamps the day instead of overflowing', () => {
    // 31 January plus a month is the end of February, not early March.
    // Overflowing would make paging forward then back land somewhere new.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('monthGrid', () => {
  it('always returns six whole weeks', () => {
    // A grid that changes height as you page months makes the popover jump.
    for (const month of [1, 2, 9, 12]) {
      expect(monthGrid(2026, month)).toHaveLength(WEEKS_SHOWN * 7);
    }
    // February 2026 starts on a Sunday and has 28 days, the tightest case.
    expect(monthGrid(2026, 2)).toHaveLength(42);
  });

  it('starts on the Monday on or before the first of the month', () => {
    // 1 September 2026 is a Tuesday, so the grid opens on 31 August.
    const grid = monthGrid(2026, 9);

    expect(grid[0]?.iso).toBe('2026-08-31');
    expect(grid[0]?.inMonth).toBe(false);
  });

  it('starts on the first itself when that is already a Monday', () => {
    // 1 June 2026 is a Monday.
    const grid = monthGrid(2026, 6);

    expect(grid[0]?.iso).toBe('2026-06-01');
    expect(grid[0]?.inMonth).toBe(true);
  });

  it('marks only the days belonging to the month', () => {
    const grid = monthGrid(2026, 9);
    const inMonth = grid.filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]?.iso).toBe('2026-09-01');
    expect(inMonth.at(-1)?.iso).toBe('2026-09-30');
  });

  it('keeps the borrowed days selectable rather than blank', () => {
    // They are how you reach the 1st of next month without paging, and holes
    // in the grid make keyboard navigation lurch.
    const grid = monthGrid(2026, 9);

    expect(grid.every((day) => day.iso.length === 10)).toBe(true);
    expect(grid.at(-1)?.inMonth).toBe(false);
  });

  it('runs consecutively with no gaps or repeats', () => {
    const grid = monthGrid(2026, 2);

    for (let index = 1; index < grid.length; index += 1) {
      expect(grid[index]?.iso).toBe(addDays(grid[index - 1]!.iso, 1));
    }
  });
});

describe('toWeeks', () => {
  it('splits the grid into rows of seven', () => {
    const weeks = toWeeks(monthGrid(2026, 9));

    expect(weeks).toHaveLength(WEEKS_SHOWN);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe('WEEKDAYS', () => {
  it('covers a week, Monday first', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]?.full).toBe('Monday');
    expect(WEEKDAYS.at(-1)?.full).toBe('Sunday');
  });

  it('carries a full name for every column', () => {
    // "T" and "S" each appear twice, so the short label alone is ambiguous to
    // anyone reading the header aloud.
    expect(WEEKDAYS.every((day) => day.full.length > day.short.length)).toBe(true);
  });
});

describe('labels', () => {
  it('names the month and year', () => {
    expect(monthLabel(2026, 9)).toMatch(/September/);
    expect(monthLabel(2026, 9)).toMatch(/2026/);
  });

  it('names a full date without drifting a day', () => {
    // Formatted in UTC to match how the value was built. Local formatting of a
    // UTC midnight shows the previous day for anyone west of Greenwich.
    const label = fullDateLabel('2026-09-12');

    expect(label).toMatch(/12/);
    expect(label).toMatch(/Sep/);
    expect(label).toMatch(/2026/);
  });
});
