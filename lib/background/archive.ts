import { parseRecruiter } from '../models/parse.js';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';

/**
 * The envelope written by "Export all data".
 *
 * A named format and version cost a few bytes and make the file recognisable to
 * anything that reads it later — including a future version of this extension
 * whose record schema has moved on.
 */
export const ARCHIVE_FORMAT = 'sourcebook-archive';
export const ARCHIVE_VERSION = 1;

export interface Archive {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  /** The schema the records inside were written against. */
  schemaVersion: number;
  recruiters: Recruiter[];
}

export function buildArchive(recruiters: readonly Recruiter[], now = new Date()): Archive {
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    recruiters: [...recruiters],
  };
}

/** Indented, because an export nobody can read is not really an escape route. */
export function serialiseArchive(archive: Archive): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

export function archiveFilename(now = new Date()): string {
  return `sourcebook-${now.toISOString().slice(0, 10)}.json`;
}

export interface RejectedRecord {
  /** Position in the file, so the user can find it. */
  index: number;
  label: string;
  errors: string[];
}

export type ImportPlan =
  | {
      ok: true;
      /** Validated records, safe to write. Nothing else ever is. */
      records: Recruiter[];
      rejected: RejectedRecord[];
      /** Ids appearing more than once in the file; the last one won. */
      duplicateIds: string[];
      creates: number;
      overwrites: number;
    }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pulls the record list out of whatever the user handed us, or explains why it
 * could not. Both this extension's own envelope and a bare array are accepted:
 * a hand-edited file is unambiguously readable, and refusing it would be
 * pedantry rather than safety.
 */
function extractRecords(parsed: unknown): { ok: true; records: unknown[] } | { ok: false; errors: string[] } {
  if (Array.isArray(parsed)) return { ok: true, records: parsed };

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: ['That file is not a sourcebook archive: expected an object or a list of records.'],
    };
  }

  if (Array.isArray(parsed['recruiters'])) {
    return { ok: true, records: parsed['recruiters'] };
  }

  const format = parsed['format'];
  if (typeof format === 'string' && format !== ARCHIVE_FORMAT) {
    return {
      ok: false,
      errors: [`That file says it is "${format}", not a sourcebook archive.`],
    };
  }

  return { ok: false, errors: ['That file has no "recruiters" list.'] };
}

function labelFor(raw: unknown, index: number): string {
  if (isRecord(raw) && typeof raw['name'] === 'string' && raw['name'].trim() !== '') {
    return raw['name'];
  }
  return `Record ${index + 1}`;
}

/**
 * The dry run.
 *
 * Reads a file and reports exactly what committing it would do, writing
 * nothing. Every record is put through `parseRecruiter`, and only its *output*
 * is carried forward — passing the caller's object through would let
 * unrecognised keys ride into storage untouched.
 */
export function planImport(json: string, existing: readonly Recruiter[] = []): ImportPlan {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    return {
      ok: false,
      errors: [`That file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const extracted = extractRecords(parsed);
  if (!extracted.ok) return extracted;

  // Keyed by id so a repeated id resolves the same way a keyed write would —
  // last one wins — rather than being counted twice in the preview and then
  // quietly collapsing on commit.
  const byId = new Map<string, Recruiter>();
  const duplicateIds: string[] = [];
  const rejected: RejectedRecord[] = [];

  extracted.records.forEach((raw, index) => {
    const result = parseRecruiter(raw);

    if (!result.ok) {
      rejected.push({ index, label: labelFor(raw, index), errors: result.errors });
      return;
    }

    if (byId.has(result.value.id) && !duplicateIds.includes(result.value.id)) {
      duplicateIds.push(result.value.id);
    }

    byId.set(result.value.id, result.value);
  });

  const existingIds = new Set(existing.map((r) => r.id));
  const records = [...byId.values()];
  const overwrites = records.filter((r) => existingIds.has(r.id)).length;

  return {
    ok: true,
    records,
    rejected,
    duplicateIds,
    creates: records.length - overwrites,
    overwrites,
  };
}
