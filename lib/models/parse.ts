import {
  NOTE_MAX_LENGTH,
  OUTREACH_STATUSES,
  SCHEMA_VERSION,
  SOURCE_TYPES,
  type JobDescription,
  type ParseResult,
  type Recruiter,
} from './types.js';

/**
 * Returns `null` when the value is acceptable, otherwise one or more messages
 * each completing the sentence "<field> ...". Returning an array lets a nested
 * validator report every problem it finds rather than only the first.
 */
type Check = (value: unknown) => string | string[] | null;

interface Shape {
  required: Record<string, Check>;
  optional: Record<string, Check>;
}

const ISO_8601_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const nonEmptyString: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim() === '') return 'must not be empty';
  return null;
};

const anyString: Check = (value) => (typeof value === 'string' ? null : 'must be a string');

const isoTimestamp: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';

  const match = ISO_8601_UTC.exec(value);
  if (!match) {
    return 'must be an ISO 8601 UTC timestamp, e.g. 2026-08-12T10:00:00.000Z';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'is not a real date';

  // Date.parse silently rolls impossible calendar dates forward:
  // 2026-02-30T10:00:00Z becomes 2026-03-02T10:00:00Z, matching the shape above
  // and parsing to a finite number. Comparing the components back is the only
  // thing that catches it.
  const part = (index: number) => Number(match[index] ?? 'NaN');
  const date = new Date(parsed);
  const roundTrips =
    date.getUTCFullYear() === part(1) &&
    date.getUTCMonth() + 1 === part(2) &&
    date.getUTCDate() === part(3) &&
    date.getUTCHours() === part(4) &&
    date.getUTCMinutes() === part(5) &&
    date.getUTCSeconds() === part(6);

  if (!roundTrips) return 'is not a real calendar date';

  return null;
};

function oneOf(allowed: readonly string[]): Check {
  return (value) => {
    if (typeof value !== 'string') return 'must be a string';
    if (!allowed.includes(value)) return `must be one of: ${allowed.join(', ')}`;
    return null;
  };
}

const stringArray: Check = (value) => {
  if (!Array.isArray(value)) return 'must be an array';
  if (!value.every((entry) => typeof entry === 'string')) return 'must contain only strings';
  return null;
};

const recruiterSource: Check = (value) => {
  if (!isRecord(value)) return 'must be an object';

  // Collects rather than returning early, so a source with a bad type, a bad
  // url, and a stray key reports all three. Bailing on the first would make
  // fixing imported data a guessing game.
  const problems: string[] = [];

  const typeError = oneOf(SOURCE_TYPES)(value['type']);
  if (typeError) problems.push(`type ${String(typeError)}`);

  if ('url' in value && value['url'] !== undefined) {
    const urlError = nonEmptyString(value['url']);
    if (urlError) problems.push(`url ${String(urlError)}`);
  }

  for (const key of Object.keys(value)) {
    if (key !== 'type' && key !== 'url') problems.push(`has an unrecognised key: ${key}`);
  }

  return problems.length > 0 ? problems : null;
};

/**
 * Counts characters the way a person does. `'👍'.length` is 2, so measuring
 * `.length` would reject a note the UI's own counter called legal.
 */
const cappedNote: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';
  if ([...value].length > NOTE_MAX_LENGTH) {
    return `must be at most ${NOTE_MAX_LENGTH} characters`;
  }
  return null;
};

/**
 * A calendar date, `YYYY-MM-DD`. Deliberately not a full timestamp: follow-ups
 * are measured in days, and a stored time of day would imply precision the
 * feature does not have and would drift across time zones.
 */
const calendarDate: Check = (value) => {
  if (typeof value !== 'string') return 'must be a string';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'must be a YYYY-MM-DD date';

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'must be a real date';
  // Rejects 2026-02-31, which Date happily rolls forward into March.
  if (parsed.toISOString().slice(0, 10) !== value) return 'must be a real date';

  return null;
};

const RECRUITER_SHAPE: Shape = {
  required: {
    id: nonEmptyString,
    name: nonEmptyString,
    profileUrl: nonEmptyString,
    outreach: oneOf(OUTREACH_STATUSES),
    source: recruiterSource,
    tags: stringArray,
    savedAt: isoTimestamp,
    updatedAt: isoTimestamp,
  },
  optional: {
    memberId: nonEmptyString,
    headline: anyString,
    company: anyString,
    note: cappedNote,
    followUpAt: calendarDate,
  },
};

const JOB_DESCRIPTION_SHAPE: Shape = {
  required: {
    id: nonEmptyString,
    title: nonEmptyString,
    company: nonEmptyString,
    url: nonEmptyString,
    // Deliberately uncapped: job descriptions are long by nature, which is also
    // why they live in local storage rather than sync.
    rawText: nonEmptyString,
    capturedAt: isoTimestamp,
  },
  optional: {
    location: anyString,
    compensation: anyString,
    exportedAt: isoTimestamp,
  },
};

function parseAgainst<T>(input: unknown, shape: Shape): ParseResult<T> {
  if (!isRecord(input)) {
    return { ok: false, reason: 'invalid', errors: ['record must be an object'] };
  }

  const version = input['schemaVersion'];

  // Checked before anything else. A newer record must be preserved intact, so
  // there is no point reporting field-level complaints about a shape this
  // version was never designed to understand.
  //
  // The integer test matters: 1.5 and Infinity are both greater than 1, so a
  // bare comparison would call them "newer" and instruct the caller to preserve
  // them untouched. They are not newer, they are corrupt, and they should be
  // reported as such.
  if (typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'newer-schema',
      errors: [
        `schemaVersion ${version} is newer than this build understands ` +
          `(${SCHEMA_VERSION}); the record must be preserved, not repaired`,
      ],
    };
  }

  const errors: string[] = [];

  if (version === undefined) {
    errors.push('schemaVersion is missing');
  } else if (version !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, received ${JSON.stringify(version)}`);
  }

  const record = (field: string, result: string | string[] | null) => {
    if (!result) return;
    for (const message of Array.isArray(result) ? result : [result]) {
      errors.push(`${field} ${message}`);
    }
  };

  for (const [field, check] of Object.entries(shape.required)) {
    if (!(field in input) || input[field] === undefined) {
      errors.push(`${field} is missing`);
      continue;
    }
    record(field, check(input[field]));
  }

  for (const [field, check] of Object.entries(shape.optional)) {
    if (!(field in input) || input[field] === undefined) continue;
    record(field, check(input[field]));
  }

  // Silently discarding an unexpected key loses data. Legitimate evolution is
  // what schemaVersion is for, so an unknown key at the current version means
  // corruption, and it should be visible rather than swallowed.
  const known = new Set([
    'schemaVersion',
    ...Object.keys(shape.required),
    ...Object.keys(shape.optional),
  ]);
  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors.push(`${key} is not a recognised field`);
  }

  if (errors.length > 0) return { ok: false, reason: 'invalid', errors };

  // Copy only the fields actually present, so an absent optional stays absent
  // rather than becoming an explicit `undefined`.
  const value: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION };
  for (const field of known) {
    if (field === 'schemaVersion') continue;
    if (field in input && input[field] !== undefined) value[field] = input[field];
  }

  return { ok: true, value: value as T };
}

/** Validates an untrusted record — including one read back from storage. */
export function parseRecruiter(input: unknown): ParseResult<Recruiter> {
  return parseAgainst<Recruiter>(input, RECRUITER_SHAPE);
}

/** Validates an untrusted record — including one read back from storage. */
export function parseJobDescription(input: unknown): ParseResult<JobDescription> {
  return parseAgainst<JobDescription>(input, JOB_DESCRIPTION_SHAPE);
}
