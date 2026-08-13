import { describe, expect, it } from 'vitest';
import { SYNC_QUOTA_BYTES } from './SyncProvider.js';
import { QUOTA_WARNING_FRACTION, formatBytes, readQuota } from './quota.js';

const usage = (used: number, quota = SYNC_QUOTA_BYTES) => ({
  used,
  quota,
  fraction: quota === 0 ? 0 : used / quota,
});

describe('formatBytes', () => {
  it('reports small amounts in whole bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(750)).toBe('750 B');
  });

  it('switches to kilobytes at 1,024 bytes', () => {
    expect(formatBytes(1_024)).toBe('1 KB');
  });

  it('drops a trailing zero rather than writing "100.0 KB"', () => {
    expect(formatBytes(SYNC_QUOTA_BYTES)).toBe('100 KB');
  });

  it('keeps one decimal where it carries information', () => {
    expect(formatBytes(12_800)).toBe('12.5 KB');
  });

  it('renders a nonsense value as zero rather than "NaN B"', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
  });
});

describe('readQuota', () => {
  it('reports bytes used and the ceiling they are measured against', () => {
    const reading = readQuota(usage(25_600));

    expect(reading.used).toBe(25_600);
    expect(reading.quota).toBe(SYNC_QUOTA_BYTES);
    expect(reading.remaining).toBe(SYNC_QUOTA_BYTES - 25_600);
  });

  it('recomputes the fraction from bytes rather than trusting the caller', () => {
    // The reported fraction is the one thing a buggy provider could get wrong,
    // and the warning threshold depends entirely on it.
    const reading = readQuota({ used: 51_200, quota: SYNC_QUOTA_BYTES, fraction: 0 });

    expect(reading.fraction).toBeCloseTo(0.5, 10);
    expect(reading.percent).toBe(50);
  });

  it('labels both sides of the meter for display', () => {
    const reading = readQuota(usage(12_800));

    expect(reading.usedLabel).toBe('12.5 KB');
    expect(reading.quotaLabel).toBe('100 KB');
  });

  describe('warning threshold', () => {
    it('stays quiet below 80%', () => {
      expect(readQuota(usage(SYNC_QUOTA_BYTES * 0.79)).level).toBe('ok');
    });

    it('warns exactly at 80%', () => {
      // The spec's migration trigger is this number, not an invented one.
      expect(readQuota(usage(SYNC_QUOTA_BYTES * QUOTA_WARNING_FRACTION)).level).toBe(
        'warning',
      );
    });

    it('warns between the threshold and the ceiling', () => {
      expect(readQuota(usage(SYNC_QUOTA_BYTES * 0.95)).level).toBe('warning');
    });

    it('reports a full store distinctly from a nearly full one', () => {
      // "Nearly full" is advice; "full" means the next save overflows to local
      // storage and stops syncing. Collapsing the two would understate it.
      expect(readQuota(usage(SYNC_QUOTA_BYTES)).level).toBe('full');
      expect(readQuota(usage(SYNC_QUOTA_BYTES + 1)).level).toBe('full');
    });
  });

  describe('percentages', () => {
    it('rounds down, so the meter never claims a threshold it has not crossed', () => {
      // 79.96% rounded to nearest reads as "80%" beside an unwarned meter.
      const reading = readQuota(usage(Math.round(SYNC_QUOTA_BYTES * 0.7996)));

      expect(reading.percent).toBeLessThan(80);
      expect(reading.level).toBe('ok');
    });

    it('never reads as empty while anything is stored', () => {
      // 300 bytes is 0.29% — floored to one decimal that is 0.0%, which tells
      // the user their saved records take no space at all.
      const reading = readQuota(usage(300));

      expect(reading.percent).toBeGreaterThan(0);
      expect(reading.usedLabel).toBe('300 B');
    });

    it('reads as empty when it genuinely is', () => {
      expect(readQuota(usage(0)).percent).toBe(0);
      expect(readQuota(usage(0)).level).toBe('ok');
    });

    it('caps the bar at 100% while still reporting the real bytes', () => {
      const reading = readQuota(usage(SYNC_QUOTA_BYTES * 2));

      // A bar wider than its track is a rendering bug; the byte count is the
      // honest number and stays untouched.
      expect(reading.percent).toBe(100);
      expect(reading.used).toBe(SYNC_QUOTA_BYTES * 2);
      expect(reading.remaining).toBe(0);
    });
  });

  describe('defensive arithmetic', () => {
    it('does not divide by a zero quota', () => {
      const reading = readQuota(usage(1_000, 0));

      expect(Number.isFinite(reading.fraction)).toBe(true);
      expect(reading.percent).toBe(100);
    });

    it('treats a negative or non-finite reading as zero', () => {
      expect(readQuota(usage(-5)).percent).toBe(0);
      expect(readQuota(usage(Number.NaN)).percent).toBe(0);
      expect(readQuota(usage(Number.POSITIVE_INFINITY)).used).toBe(0);
    });
  });
});
