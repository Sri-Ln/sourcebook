import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataClient, RecruiterClient } from '../../lib/messaging/client.js';
import { SYNC_QUOTA_BYTES } from '../../lib/storage/SyncProvider.js';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import App from './App.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'a',
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

function fakeClient(overrides: Partial<RecruiterClient & DataClient> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ recruiters: [recruiter()], overflowedIds: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ overflowed: false }),
    usage: vi
      .fn()
      .mockResolvedValue({ used: 25_600, quota: SYNC_QUOTA_BYTES, fraction: 0.25 }),
    importRecruiters: vi
      .fn()
      .mockResolvedValue({ imported: 0, skipped: 0, overflowed: 0, errors: [] }),
    renameTag: vi.fn().mockResolvedValue(1),
    removeTag: vi.fn().mockResolvedValue(1),
    ...overrides,
  } satisfies RecruiterClient & DataClient;
}

describe('options App', () => {
  beforeEach(() => vi.clearAllMocks());

  it('states plainly that no data leaves the machine', async () => {
    render(<App client={fakeClient()} />);

    expect(await screen.findByText(/Your data stays on your machine/i)).toBeDefined();
    expect(screen.getByText(/no server, no account, and no telemetry/i)).toBeDefined();
  });

  it('is honest about browser sync rather than overclaiming', async () => {
    // Records live in `chrome.storage.sync`. Saying "nothing ever leaves this
    // device" full stop would be a lie the moment browser sync is switched on,
    // and a privacy claim that is not exactly true is worse than none.
    render(<App client={fakeClient()} />);

    expect(await screen.findByText(/browser sync|bookmarks/i)).toBeDefined();
  });

  it('shows the quota meter from the measured reading', async () => {
    render(<App client={fakeClient()} />);

    expect(await screen.findByText(/25 KB of 100 KB/)).toBeDefined();
  });

  it('shows the tags found in the saved records', async () => {
    render(<App client={fakeClient()} />);

    expect(await screen.findByText('fintech')).toBeDefined();
  });

  it('surfaces a load failure and offers a retry', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('The background worker did not respond.'))
      .mockResolvedValue({ recruiters: [recruiter()], overflowedIds: [] });
    render(<App client={fakeClient({ list })} />);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/did not respond/)).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('fintech')).toBeDefined();
  });

  it('still offers export when the storage reading is unavailable', async () => {
    // `getBytesInUse` is the most fragile call on the page. Losing the meter
    // must not take the escape hatch down with it.
    const usage = vi.fn().mockRejectedValue(new Error('getBytesInUse is not a function'));
    render(<App client={fakeClient({ usage })} />);

    expect(await screen.findByRole('button', { name: /export all data/i })).toBeDefined();
    expect(screen.getByText(/storage reading is unavailable/i)).toBeDefined();
  });

  it('reloads after a change so the meter and tags stay current', async () => {
    const client = fakeClient();
    render(<App client={client} />);

    await screen.findByText('fintech');
    expect(client.list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /delete fintech/i }));
    await userEvent.click(screen.getByRole('button', { name: /^remove the tag$/i }));

    // A stale meter after a bulk delete would tell the user their change did
    // not free anything.
    await waitFor(() => expect(client.list).toHaveBeenCalledTimes(2));
    expect(client.usage).toHaveBeenCalledTimes(2);
  });
});
