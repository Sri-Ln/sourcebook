import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  archiveFilename,
  buildArchive,
  planImport,
  serialiseArchive,
} from './archive.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: '5f8d2c1a-3b4e-4f5a-8c9d-1e2f3a4b5c6d',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: ['fintech'],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

const at = new Date('2026-08-13T09:30:00.000Z');

describe('buildArchive', () => {
  it('carries every recruiter given to it', () => {
    const archive = buildArchive([recruiter({ id: 'a' }), recruiter({ id: 'b' })], at);

    expect(archive.recruiters.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('names its own format and version so a reader can recognise it', () => {
    const archive = buildArchive([], at);

    expect(archive.format).toBe(ARCHIVE_FORMAT);
    expect(archive.version).toBe(ARCHIVE_VERSION);
  });

  it('records the record schema version, not just the envelope version', () => {
    // The envelope and the records inside it can move independently, and an
    // importer needs to know which schema the contents were written against.
    expect(buildArchive([], at).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('stamps when the export was taken', () => {
    expect(buildArchive([], at).exportedAt).toBe('2026-08-13T09:30:00.000Z');
  });

  it('round-trips back through the importer', () => {
    // The guarantee the export exists for: data that cannot be read back is not
    // an escape route, it is a souvenir.
    const original = [recruiter({ id: 'a' }), recruiter({ id: 'b', name: 'Sam Placeholder' })];

    const plan = planImport(serialiseArchive(buildArchive(original, at)));

    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.records).toEqual(original);
  });
});

describe('serialiseArchive', () => {
  it('indents, so the file is legible to a person and diffable in git', () => {
    expect(serialiseArchive(buildArchive([recruiter()], at))).toContain('\n  ');
  });
});

describe('archiveFilename', () => {
  it('dates the file so successive exports do not overwrite each other', () => {
    expect(archiveFilename(at)).toBe('sourcebook-2026-08-13.json');
  });
});

describe('planImport', () => {
  const fileOf = (records: unknown[]) =>
    JSON.stringify({
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: at.toISOString(),
      schemaVersion: SCHEMA_VERSION,
      recruiters: records,
    });

  describe('unreadable input', () => {
    it('reports a file that is not JSON instead of throwing', () => {
      const plan = planImport('not json at all');

      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.errors.join(' ')).toMatch(/not valid JSON/i);
    });

    it('rejects JSON that is neither an archive nor a list of records', () => {
      const plan = planImport('42');

      expect(plan.ok).toBe(false);
    });

    it('rejects an archive whose recruiters field is not a list', () => {
      const plan = planImport(JSON.stringify({ format: ARCHIVE_FORMAT, recruiters: {} }));

      expect(plan.ok).toBe(false);
    });

    it('names the format it expected when handed someone else’s export', () => {
      const plan = planImport(JSON.stringify({ format: 'linkedin-connections', rows: [] }));

      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.errors.join(' ')).toMatch(/sourcebook/i);
    });
  });

  describe('shapes accepted', () => {
    it('reads the archive envelope this extension writes', () => {
      const plan = planImport(fileOf([recruiter()]));

      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.records).toHaveLength(1);
    });

    it('also reads a bare array of records', () => {
      // A hand-edited file, or one record pulled out of a bigger export. There
      // is no reason to refuse data that is unambiguously readable.
      const plan = planImport(JSON.stringify([recruiter()]));

      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.records).toHaveLength(1);
    });

    it('accepts an empty archive without calling it an error', () => {
      const plan = planImport(fileOf([]));

      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.records).toEqual([]);
    });
  });

  describe('validation', () => {
    it('keeps the valid records and sets the invalid ones aside', () => {
      const plan = planImport(fileOf([recruiter({ id: 'good' }), { id: 'bad', name: 42 }]));

      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.records.map((r) => r.id)).toEqual(['good']);
      expect(plan.rejected).toHaveLength(1);
    });

    it('says which record failed and why', () => {
      const plan = planImport(fileOf([{ id: 'bad', name: 42 }]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.rejected[0]?.index).toBe(0);
      expect(plan.rejected[0]?.errors.length).toBeGreaterThan(0);
    });

    it('labels a rejected record by name when it has one worth showing', () => {
      const plan = planImport(fileOf([{ name: 'Jane Placeholder' }]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.rejected[0]?.label).toBe('Jane Placeholder');
    });

    it('falls back to a position when the record has no usable name', () => {
      const plan = planImport(fileOf([{ id: 'bad' }]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.rejected[0]?.label).toMatch(/1/);
    });

    it('refuses a record written by a newer schema rather than importing it', () => {
      // This build cannot know which fields it would drop on the way in.
      const plan = planImport(fileOf([{ ...recruiter(), schemaVersion: 99 }]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.records).toEqual([]);
      expect(plan.rejected[0]?.errors.join(' ')).toMatch(/newer/i);
    });

    it('yields the parsed record, not the raw input', () => {
      // Passing the caller's object through would carry unrecognised keys into
      // storage. The parser's output is the only thing that should be written.
      const plan = planImport(fileOf([{ ...recruiter(), stowaway: 'x' }]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.records).toEqual([]);
      expect(plan.rejected).toHaveLength(1);
    });
  });

  describe('the dry-run count', () => {
    it('separates records that are new from records that replace one', () => {
      const existing = [recruiter({ id: 'known', name: 'Known Placeholder' })];
      const plan = planImport(fileOf([recruiter({ id: 'known' }), recruiter({ id: 'fresh' })]), existing);

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.creates).toBe(1);
      expect(plan.overwrites).toBe(1);
    });

    it('counts everything as new when nothing is stored yet', () => {
      const plan = planImport(fileOf([recruiter({ id: 'a' }), recruiter({ id: 'b' })]));

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.creates).toBe(2);
      expect(plan.overwrites).toBe(0);
    });

    it('collapses a repeated id within one file and says it did', () => {
      // Two records claiming the same id cannot both survive a keyed write, and
      // silently keeping one would misreport the count shown before committing.
      const plan = planImport(
        fileOf([recruiter({ id: 'dup', name: 'First' }), recruiter({ id: 'dup', name: 'Last' })]),
      );

      if (!plan.ok) throw new Error('expected a readable plan');
      expect(plan.records).toHaveLength(1);
      expect(plan.records[0]?.name).toBe('Last');
      expect(plan.duplicateIds).toEqual(['dup']);
      expect(plan.creates).toBe(1);
    });
  });
});
