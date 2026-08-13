import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataClient } from '../../lib/messaging/client.js';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import { TagManager } from './TagManager.js';

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
      .mockResolvedValue({ imported: 0, skipped: 0, overflowed: 0, errors: [] }),
    renameTag: vi.fn().mockResolvedValue(2),
    removeTag: vi.fn().mockResolvedValue(2),
    ...overrides,
  };
}

const tagged = [
  recruiter({ id: 'a', tags: ['fintech', 'remote'] }),
  recruiter({ id: 'b', tags: ['fintech'] }),
];

function renderManager(client: DataClient, recruiters = tagged, onChanged = vi.fn()) {
  render(<TagManager client={client} recruiters={recruiters} onChanged={onChanged} />);
  return { client, onChanged };
}

describe('TagManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists every tag with how many records carry it', () => {
    renderManager(fakeClient());

    expect(screen.getByText('fintech')).toBeDefined();
    expect(screen.getByText(/2 records/)).toBeDefined();
    expect(screen.getByText('remote')).toBeDefined();
    expect(screen.getByText(/1 record\b/)).toBeDefined();
  });

  it('explains an empty list rather than showing a blank panel', () => {
    renderManager(fakeClient(), [recruiter()]);

    expect(screen.getByText(/no tags yet/i)).toBeDefined();
  });

  describe('rename', () => {
    it('starts from the current name so a typo fix is one keystroke', async () => {
      renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /rename fintech/i }));

      expect(screen.getByRole('textbox')).toHaveProperty('value', 'fintech');
    });

    it('renames across every record and refreshes', async () => {
      const { client, onChanged } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /rename fintech/i }));
      await userEvent.clear(screen.getByRole('textbox'));
      await userEvent.type(screen.getByRole('textbox'), 'finance');
      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      expect(client.renameTag).toHaveBeenCalledWith('fintech', 'finance');
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it('reports how many records it touched', async () => {
      renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /rename fintech/i }));
      await userEvent.clear(screen.getByRole('textbox'));
      await userEvent.type(screen.getByRole('textbox'), 'finance');
      await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

      // Not just "it worked": a rename that caught half the records looks
      // identical to one that caught them all until you are told the number.
      expect(await screen.findByText(/Renamed to .* in 2 records/i)).toBeDefined();
    });

    it('will not save a blank name', async () => {
      const { client } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /rename fintech/i }));
      await userEvent.clear(screen.getByRole('textbox'));

      expect(screen.getByRole('button', { name: /^save$/i })).toHaveProperty('disabled', true);
      expect(client.renameTag).not.toHaveBeenCalled();
    });

    it('backs out without writing', async () => {
      const { client } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /rename fintech/i }));
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(client.renameTag).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  describe('delete', () => {
    it('asks first, and writes nothing while asking', async () => {
      const { client } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));

      // A tag delete rewrites every record carrying it; there is no undo.
      expect(client.removeTag).not.toHaveBeenCalled();
      expect(screen.getByText(/2 records/i)).toBeDefined();
    });

    it('promises the records themselves survive', async () => {
      renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));

      // The obvious fear on being asked to confirm a delete is that the
      // recruiters go with the tag. Saying otherwise costs one sentence.
      expect(screen.getByText(/recruiters .*kept|not.*delete.*recruiters/i)).toBeDefined();
    });

    it('deletes on confirmation and refreshes', async () => {
      const { client, onChanged } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));
      await userEvent.click(screen.getByRole('button', { name: /^remove the tag$/i }));

      expect(client.removeTag).toHaveBeenCalledWith('fintech');
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it('backs out without writing', async () => {
      const { client } = renderManager(fakeClient());

      await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));
      await userEvent.click(screen.getByRole('button', { name: /^keep it$/i }));

      expect(client.removeTag).not.toHaveBeenCalled();
    });
  });

  it('surfaces a failure instead of implying the change landed', async () => {
    const client = fakeClient({
      removeTag: vi.fn().mockRejectedValue(new Error('The background worker did not respond.')),
    });
    renderManager(client);

    await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));
    await userEvent.click(screen.getByRole('button', { name: /^remove the tag$/i }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/did not respond/)).toBeDefined();
  });
});
