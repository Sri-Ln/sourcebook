import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVE_FORMAT } from '../../lib/background/archive.js';
import type { DataClient } from '../../lib/messaging/client.js';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import { ImportExport } from './ImportExport.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'a',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function fakeClient(overrides: Partial<DataClient> = {}): DataClient {
  return {
    importRecruiters: vi
      .fn()
      .mockResolvedValue({ imported: 1, skipped: 0, overflowed: 0, errors: [] }),
    renameTag: vi.fn().mockResolvedValue(0),
    removeTag: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function fileOf(records: unknown[]): File {
  const json = JSON.stringify({ format: ARCHIVE_FORMAT, version: 1, recruiters: records });
  return new File([json], 'backup.json', { type: 'application/json' });
}

const chooseFile = async (file: File) =>
  userEvent.upload(screen.getByLabelText(/import from a JSON file/i), file);

describe('ImportExport', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('export', () => {
    it('writes every saved record into a dated file', async () => {
      const download = vi.fn();
      render(
        <ImportExport
          client={fakeClient()}
          recruiters={[recruiter({ id: 'a' }), recruiter({ id: 'b' })]}
          onChanged={vi.fn()}
          download={download}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const [filename, contents] = download.mock.calls[0] as [string, string];
      expect(filename).toMatch(/^sourcebook-\d{4}-\d{2}-\d{2}\.json$/);
      expect(JSON.parse(contents).recruiters).toHaveLength(2);
    });

    it('confirms how many records left the building', async () => {
      render(
        <ImportExport
          client={fakeClient()}
          recruiters={[recruiter()]}
          onChanged={vi.fn()}
          download={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(await screen.findByText(/1 record/i)).toBeDefined();
    });

    it('has nothing to offer when nothing is saved', async () => {
      render(
        <ImportExport
          client={fakeClient()}
          recruiters={[]}
          onChanged={vi.fn()}
          download={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /export/i })).toHaveProperty('disabled', true);
    });
  });

  describe('the dry run', () => {
    it('counts what the file would do before writing anything', async () => {
      const client = fakeClient();
      render(
        <ImportExport client={client} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter({ id: 'a' }), recruiter({ id: 'b' })]));

      expect(await screen.findByText(/2 records ready to import/i)).toBeDefined();
      // The whole point of a dry run: the user sees the number first.
      expect(client.importRecruiters).not.toHaveBeenCalled();
    });

    it('separates records that are new from records that replace one', async () => {
      render(
        <ImportExport
          client={fakeClient()}
          recruiters={[recruiter({ id: 'known' })]}
          onChanged={vi.fn()}
          download={vi.fn()}
        />,
      );

      await chooseFile(fileOf([recruiter({ id: 'known' }), recruiter({ id: 'fresh' })]));

      // Replacing a record the user has already annotated is not the same
      // action as adding one, and the count should not hide that.
      expect(await screen.findByText(/1 new/i)).toBeDefined();
      expect(screen.getByText(/1 will replace/i)).toBeDefined();
    });

    it('names the records it would refuse, and why', async () => {
      render(
        <ImportExport client={fakeClient()} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter(), { name: 'Broken Placeholder' }]));

      expect(await screen.findByText(/Broken Placeholder/)).toBeDefined();
      expect(screen.getByText(/skipped/i)).toBeDefined();
    });

    it('warns when the same record appears twice in one file', async () => {
      render(
        <ImportExport client={fakeClient()} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter({ id: 'dup' }), recruiter({ id: 'dup' })]));

      expect(await screen.findByText(/appears more than once/i)).toBeDefined();
    });

    it('explains a file it cannot read instead of failing silently', async () => {
      render(
        <ImportExport client={fakeClient()} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      // A truncated or hand-mangled export, which is the realistic way this
      // arrives — the file still ends in .json.
      await chooseFile(new File(['{"recruiters": ['], 'backup.json', { type: 'application/json' }));

      expect(await screen.findByRole('alert')).toBeDefined();
      expect(screen.getByText(/not valid JSON/i)).toBeDefined();
    });

    it('says so when a readable file contains no records', async () => {
      render(
        <ImportExport client={fakeClient()} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([]));

      expect(await screen.findByText(/no records/i)).toBeDefined();
    });
  });

  describe('committing the import', () => {
    it('writes only the validated records, and only once confirmed', async () => {
      const client = fakeClient();
      render(
        <ImportExport client={client} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter({ id: 'a' }), { name: 'Broken Placeholder' }]));
      await userEvent.click(await screen.findByRole('button', { name: /^import 1 record/i }));

      const [records] = (client.importRecruiters as ReturnType<typeof vi.fn>).mock
        .calls[0] as [Recruiter[]];
      // The rejected record must not travel to the writer at all.
      expect(records.map((r) => r.id)).toEqual(['a']);
    });

    it('reports what was written and refreshes the page', async () => {
      const onChanged = vi.fn();
      const client = fakeClient({
        importRecruiters: vi
          .fn()
          .mockResolvedValue({ imported: 2, skipped: 0, overflowed: 0, errors: [] }),
      });
      render(
        <ImportExport client={client} recruiters={[]} onChanged={onChanged} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter({ id: 'a' }), recruiter({ id: 'b' })]));
      await userEvent.click(await screen.findByRole('button', { name: /^import 2 records/i }));

      expect(await screen.findByText(/Imported 2 records/i)).toBeDefined();
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it('says when imported records could not fit in synced storage', async () => {
      const client = fakeClient({
        importRecruiters: vi
          .fn()
          .mockResolvedValue({ imported: 1, skipped: 0, overflowed: 1, errors: [] }),
      });
      render(
        <ImportExport client={client} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter()]));
      await userEvent.click(await screen.findByRole('button', { name: /^import 1 record/i }));

      // "Imported" alone would leave the user believing it had synced.
      expect(await screen.findByText(/this device only/i)).toBeDefined();
    });

    it('discards the plan when the user backs out', async () => {
      const client = fakeClient();
      render(
        <ImportExport client={client} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter()]));
      await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

      expect(client.importRecruiters).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText(/1 new/i)).toBeNull());
    });

    it('surfaces a write failure rather than claiming success', async () => {
      const client = fakeClient({
        importRecruiters: vi.fn().mockRejectedValue(new Error('The background worker did not respond.')),
      });
      render(
        <ImportExport client={client} recruiters={[]} onChanged={vi.fn()} download={vi.fn()} />,
      );

      await chooseFile(fileOf([recruiter()]));
      await userEvent.click(await screen.findByRole('button', { name: /^import 1 record/i }));

      expect(await screen.findByRole('alert')).toBeDefined();
      expect(screen.getByText(/did not respond/)).toBeDefined();
    });
  });
});
