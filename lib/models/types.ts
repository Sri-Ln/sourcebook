/**
 * The current schema version. Every stored record carries it.
 *
 * Storage backends are swappable; a schema that failed to capture something is
 * not, because by the time the gap is noticed the context is gone. This field
 * is what makes any later migration possible, and it costs one integer today.
 */
export const SCHEMA_VERSION = 1;

/**
 * Notes are capped because they live in `chrome.storage.sync`, which allows
 * 102,400 bytes in total. Spilling long notes to local storage was rejected: it
 * would quietly break the sync promise, since the note would not follow the
 * user to another machine. A visible limit beats an invisible failure.
 */
export const NOTE_MAX_LENGTH = 300;

/**
 * The statuses worth tracking, in the order outreach actually progresses.
 *
 * `replied` was here and was removed: it is a thing that happens to you rather
 * than a thing you do, and it changed nothing about what to do next — you still
 * either got the referral or you did not. Every state left is one you act on.
 *
 * **Adding a value is safe; removing one is not.** `parseRecruiter` validates
 * against this list, so a record stored under a retired value fails validation
 * and is quarantined: kept in storage, absent from the list. Removing `replied`
 * was safe only because nothing was saved under it yet.
 */
export const OUTREACH_STATUSES = ['not-contacted', 'messaged', 'referred', 'closed'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const SOURCE_TYPES = ['profile', 'post', 'search', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * How this person was found. Six months on, "in a post about a platform hiring
 * spree" is often more actionable than a job title — it signals they are
 * actively recruiting and supplies a warm opener.
 */
export interface RecruiterSource {
  type: SourceType;
  url?: string;
}

export interface Recruiter {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  profileUrl: string;
  /** Stable identity when extractable. Vanity URLs are user-changeable and rot. */
  memberId?: string;
  headline?: string;
  company?: string;
  outreach: OutreachStatus;
  source: RecruiterSource;
  tags: string[];
  note?: string;
  /**
   * When to get back in touch. A date only — the time of day is noise for
   * something measured in days, and storing one would imply a precision the
   * feature does not have.
   */
  followUpAt?: string;
  savedAt: string;
  updatedAt: string;
}

export interface JobDescription {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  company: string;
  location?: string;
  compensation?: string;
  url: string;
  rawText: string;
  capturedAt: string;
  /** Absent means "not yet exported to rolecraft". */
  exportedAt?: string;
}

/**
 * `newer-schema` is kept separate from ordinary corruption on purpose. A record
 * written by a newer build — synced from another machine — contains fields this
 * version does not know about. Treating it as malformed and "repairing" it
 * would destroy them.
 */
export type ParseFailureReason = 'invalid' | 'newer-schema';

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ParseFailureReason; errors: string[] };

/**
 * A record that failed validation. Kept rather than deleted, so that bad data
 * is a diagnosable problem instead of silent loss.
 */
export interface QuarantinedRecord {
  key: string;
  raw: unknown;
  reason: ParseFailureReason;
  errors: string[];
  quarantinedAt: string;
}
