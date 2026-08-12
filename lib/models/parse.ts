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
 * Returns `null` when the value is acceptable, otherwise a message completing
 * the sentence "<field> ...".
 */
type Check = (value: unknown) => string | null;

interface Shape {
  required: Record<string, Check>;
  optional: Record<string, Check>;
}

const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

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
  if (!ISO_8601_UTC.test(value)) {
    return 'must be an ISO 8601 UTC timestamp, e.g. 2026-08-12T10:00:00.000Z';
  }
  if (Number.isNaN(Date.parse(value))) return 'is not a real date';
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

  const typeError = oneOf(SOURCE_TYPES)(value['type']);
  if (typeError) return `type ${typeError}`;

  if ('url' in value && value['url'] !== undefined) {
    const urlError = nonEmptyString(value['url']);
    if (urlError) return `url ${urlError}`;
  }

  for (const key of Object.keys(value)) {
    if (key !== 'type' && key !== 'url') return `has an unrecognised key: ${key}`;
  }

  return null;
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
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
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

  for (const [field, check] of Object.entries(shape.required)) {
    if (!(field in input) || input[field] === undefined) {
      errors.push(`${field} is missing`);
      continue;
    }
    const message = check(input[field]);
    if (message) errors.push(`${field} ${message}`);
  }

  for (const [field, check] of Object.entries(shape.optional)) {
    if (!(field in input) || input[field] === undefined) continue;
    const message = check(input[field]);
    if (message) errors.push(`${field} ${message}`);
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
