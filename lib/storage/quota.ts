import type { StorageUsage } from './SyncProvider.js';

/**
 * Where the meter turns from information into a warning.
 *
 * 0.8 is not an invented number: it is the migration trigger in the design
 * spec, so the meter and the decision to move off `chrome.storage.sync` fire at
 * the same point rather than drifting apart.
 */
export const QUOTA_WARNING_FRACTION = 0.8;

export type QuotaLevel = 'ok' | 'warning' | 'full';

export interface QuotaReading {
  /** Bytes actually measured. Never capped — this is the honest number. */
  used: number;
  quota: number;
  /** 0–1, uncapped. Can exceed 1 if a foreign key shares the namespace. */
  fraction: number;
  /** 0–100, capped and rounded *down*. Safe as a bar width. */
  percent: number;
  remaining: number;
  level: QuotaLevel;
  usedLabel: string;
  quotaLabel: string;
}

/**
 * A byte count that is not a positive finite number is not a small reading, it
 * is a broken one. Treating it as zero keeps `NaN%` and a negative bar out of
 * the UI without pretending the arithmetic succeeded.
 */
function sanitise(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Kilobytes are 1,024 bytes here, matching how Chrome documents the quota. */
export function formatBytes(bytes: number): string {
  const safe = sanitise(bytes);

  if (safe < 1_024) return `${Math.round(safe)} B`;

  // `.toFixed(1)` on a whole number gives "100.0 KB", which reads as spurious
  // precision on a figure that is exactly round.
  return `${(safe / 1_024).toFixed(1).replace(/\.0$/, '')} KB`;
}

/**
 * Turns a raw usage reading into everything a meter needs to draw itself.
 *
 * Pure on purpose. The options page owns the full meter, but the popup needs
 * the same threshold and the same percentage, and two implementations of "are
 * we at 80% yet" would eventually disagree.
 */
export function readQuota(usage: StorageUsage): QuotaReading {
  const used = sanitise(usage.used);
  const quota = sanitise(usage.quota);

  // The reported fraction is deliberately ignored. It is the one field a buggy
  // or stubbed provider can get wrong, and the warning depends entirely on it.
  const fraction = quota === 0 ? (used > 0 ? 1 : 0) : used / quota;

  const floored = Math.floor(Math.min(fraction, 1) * 1_000) / 10;

  // 300 bytes of real records is 0.29%, which floors to 0.0% — a meter telling
  // the user their saved data occupies nothing at all.
  const percent = floored === 0 && used > 0 ? 0.1 : floored;

  return {
    used,
    quota,
    fraction,
    percent,
    remaining: Math.max(0, quota - used),
    level: fraction >= 1 ? 'full' : fraction >= QUOTA_WARNING_FRACTION ? 'warning' : 'ok',
    usedLabel: formatBytes(used),
    quotaLabel: formatBytes(quota),
  };
}
