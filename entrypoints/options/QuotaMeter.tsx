import type { StorageUsage } from '../../lib/storage/SyncProvider.js';
import { readQuota } from '../../lib/storage/quota.js';

/**
 * What the meter is measuring, in the unit the user thinks in.
 *
 * "100 KB" is not a quantity anyone has intuition about. Records is, and the
 * range is honest: it genuinely depends on how much they write in notes.
 */
const CEILING_EXPLANATION =
  'Chrome allows 100 KB of synced storage — roughly 150 to 250 recruiters, ' +
  'depending on how long your notes are.';

export function QuotaMeter({ usage }: { usage: StorageUsage }) {
  const quota = readQuota(usage);

  return (
    <section className="panel" aria-labelledby="quota-heading">
      <h2 id="quota-heading">Storage</h2>

      <div
        className={`meter meter--${quota.level}`}
        role="progressbar"
        aria-label="Synced storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quota.percent}
        aria-valuetext={`${quota.usedLabel} of ${quota.quotaLabel}`}
      >
        {/* Capped by `readQuota`, so a foreign key sharing the namespace
            cannot push the fill outside its track. */}
        <div className="meter__fill" style={{ width: `${quota.percent}%` }} />
      </div>

      <p className="meter__reading">
        <strong>
          {quota.usedLabel} of {quota.quotaLabel}
        </strong>{' '}
        used ({quota.percent}%)
      </p>

      <p className="muted">{CEILING_EXPLANATION}</p>

      {/* Measured, not counted. A record count cannot express a ceiling that
          moves with note length; `getBytesInUse()` can. */}
      <p className="muted">Measured from your browser, not estimated from a record count.</p>

      {quota.level === 'warning' ? (
        <p role="alert" className="notice notice--warning">
          Storage is {quota.percent}% full. Export a copy now, then remove recruiters you
          have finished with or shorten long notes. Once it fills, new saves stay on this
          device instead of syncing.
        </p>
      ) : null}

      {quota.level === 'full' ? (
        <p role="alert" className="notice notice--full">
          Storage is full. New recruiters are being saved to this device only — they will
          not reach your other machines. Export a copy, then remove records you have
          finished with to make room.
        </p>
      ) : null}
    </section>
  );
}
