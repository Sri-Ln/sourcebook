import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { RecruiterList } from './RecruiterList.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'a',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder/',
    headline: 'Technical Recruiter at Placeholder Corp',
    company: 'Placeholder Corp',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function fakeClient(overrides: Partial<RecruiterClient> = {}): RecruiterClient {
  return {
    list: vi.fn().mockResolvedValue({ recruiters: [], overflowedIds: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ overflowed: false }),
    usage: vi.fn().mockResolvedValue({ used: 0, quota: 102_400, fraction: 0 }),
    ...overrides,
  };
}

describe('RecruiterList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains how to get started when nothing is saved', async () => {
    render(<RecruiterList client={fakeClient()} />);

    expect(await screen.findByText(/Nothing saved yet/i)).toBeDefined();
  });

  it('shows name, headline, company, status, and provenance', async () => {
    const client = fakeClient({
      list: vi.fn().mockResolvedValue({ recruiters: [recruiter()], overflowedIds: [] }),
    });

    render(<RecruiterList client={client} />);

    expect(await screen.findByText('Jane Placeholder')).toBeDefined();
    expect(screen.getByText(/Technical Recruiter at Placeholder Corp/)).toBeDefined();
    expect(screen.getByText('Not contacted')).toBeDefined();
    expect(screen.getByText('From their profile')).toBeDefined();
  });

  it('links through to the LinkedIn profile in a new tab', async () => {
    const client = fakeClient({
      list: vi.fn().mockResolvedValue({ recruiters: [recruiter()], overflowedIds: [] }),
    });

    render(<RecruiterList client={client} />);

    const link = (await screen.findByText('Jane Placeholder')) as HTMLAnchorElement;
    expect(link.href).toContain('/in/jane-placeholder/');
    // The popup closes the moment focus leaves it, so same-tab navigation
    // would simply lose the list.
    expect(link.target).toBe('_blank');
  });

  it('orders most recently saved first', async () => {
    const client = fakeClient({
      list: vi.fn().mockResolvedValue({
        recruiters: [
          recruiter({ id: 'old', name: 'Older Save', savedAt: '2026-01-01T00:00:00.000Z' }),
          recruiter({ id: 'new', name: 'Newer Save', savedAt: '2026-08-01T00:00:00.000Z' }),
        ],
        overflowedIds: [],
      }),
    });

    render(<RecruiterList client={client} />);
    await screen.findByText('Newer Save');

    const names = screen.getAllByRole('link').map((el) => el.textContent);
    expect(names).toEqual(['Newer Save', 'Older Save']);
  });

  it('flags a record that only saved locally', async () => {
    const client = fakeClient({
      list: vi.fn().mockResolvedValue({ recruiters: [recruiter()], overflowedIds: ['a'] }),
    });

    render(<RecruiterList client={client} />);

    expect(await screen.findByText('Not synced')).toBeDefined();
  });

  it('removes a recruiter and refreshes the list', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ recruiters: [recruiter()], overflowedIds: [] })
      .mockResolvedValue({ recruiters: [], overflowedIds: [] });
    const client = fakeClient({ list });

    render(<RecruiterList client={client} />);
    await screen.findByText('Jane Placeholder');

    await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));

    expect(client.remove).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.queryByText('Jane Placeholder')).toBeNull());
  });

  it('surfaces a load failure instead of showing an empty list', async () => {
    const client = fakeClient({
      list: vi.fn().mockRejectedValue(new Error('The background worker did not respond.')),
    });

    render(<RecruiterList client={client} />);

    // An empty list and a broken list look identical, and the difference
    // matters enormously to someone who has saved forty recruiters.
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/did not respond/)).toBeDefined();
  });

  it('can retry after a failure', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ recruiters: [recruiter()], overflowedIds: [] });
    const client = fakeClient({ list });

    render(<RecruiterList client={client} />);
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(await screen.findByText('Jane Placeholder')).toBeDefined();
  });
});
