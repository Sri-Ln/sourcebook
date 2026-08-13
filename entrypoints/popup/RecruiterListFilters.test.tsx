import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { EMPTY_FILTER, type RecruiterFilter } from '../../lib/recruiters/filter.js';
import { RecruiterList, type FilterStore } from './RecruiterList.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    headline: 'Technical Recruiter',
    company: 'Placeholder Corp',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function fakeClient(recruiters: Recruiter[], overrides: Partial<RecruiterClient> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ recruiters, overflowedIds: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ overflowed: false }),
    usage: vi.fn().mockResolvedValue({ used: 0, quota: 102_400, fraction: 0 }),
    ...overrides,
  } as RecruiterClient;
}

const people = [
  recruiter({ id: 'ada', name: 'Ada Lovelace', outreach: 'not-contacted', tags: ['fintech'] }),
  recruiter({ id: 'grace', name: 'Grace Hopper', outreach: 'messaged', tags: ['gaming'] }),
];

describe('RecruiterList — search and filtering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('narrows the list as you type', async () => {
    render(<RecruiterList client={fakeClient(people)} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'grace');

    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull());
    expect(screen.getByText('Grace Hopper')).toBeDefined();
  });

  it('filters to never-contacted in one click', async () => {
    render(<RecruiterList client={fakeClient(people)} />);
    await screen.findByText('Ada Lovelace');

    // The filter that matters when an opening appears.
    await userEvent.click(screen.getByRole('button', { name: 'Not contacted' }));

    await waitFor(() => expect(screen.queryByText('Grace Hopper')).toBeNull());
    expect(screen.getByText('Ada Lovelace')).toBeDefined();
  });

  it('filters by tag', async () => {
    render(<RecruiterList client={fakeClient(people)} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: 'gaming' }));

    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull());
  });

  it('offers a way out when nothing matches', async () => {
    render(<RecruiterList client={fakeClient(people)} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'nobody');

    // A dead end with no escape is how a filter becomes a bug report.
    const clear = await screen.findByRole('button', { name: /Clear/i });
    await userEvent.click(clear);

    expect(await screen.findByText('Ada Lovelace')).toBeDefined();
  });

  it('shows how many of the total are visible while filtering', async () => {
    render(<RecruiterList client={fakeClient(people)} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'ada');

    expect(await screen.findByText('1 of 2')).toBeDefined();
  });

  describe('persistence', () => {
    function store(initial: RecruiterFilter = EMPTY_FILTER) {
      const saved: RecruiterFilter[] = [];
      const filterStore: FilterStore = {
        load: vi.fn().mockResolvedValue(initial),
        save: vi.fn().mockImplementation(async (f: RecruiterFilter) => {
          saved.push(f);
        }),
      };
      return { filterStore, saved };
    }

    it('restores the filter from the previous session', async () => {
      const { filterStore } = store({ ...EMPTY_FILTER, statuses: ['messaged'] });

      render(<RecruiterList client={fakeClient(people)} filterStore={filterStore} />);

      // The popup closes on every focus loss; losing the filter each time would
      // make it useless for working through a list.
      await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull());
      expect(screen.getByText('Grace Hopper')).toBeDefined();
    });

    it('persists a change', async () => {
      const { filterStore, saved } = store();
      render(<RecruiterList client={fakeClient(people)} filterStore={filterStore} />);
      await screen.findByText('Ada Lovelace');

      await userEvent.click(screen.getByRole('button', { name: 'Not contacted' }));

      await waitFor(() => expect(saved.at(-1)?.statuses).toEqual(['not-contacted']));
    });
  });
});

describe('RecruiterList — inline status editing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('changes status from the row', async () => {
    const client = fakeClient([people[0]!]);
    render(<RecruiterList client={client} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(
      screen.getByLabelText(/Outreach status for Ada Lovelace/i),
      'messaged',
    );

    await waitFor(() => expect(client.save).toHaveBeenCalled());
    expect(client.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ada', outreach: 'messaged' }),
    );
  });

  it('advances updatedAt', async () => {
    const client = fakeClient([people[0]!]);
    render(<RecruiterList client={client} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(
      screen.getByLabelText(/Outreach status for Ada Lovelace/i),
      'replied',
    );

    await waitFor(() => expect(client.save).toHaveBeenCalled());
    const [saved] = (client.save as ReturnType<typeof vi.fn>).mock.calls[0] as [Recruiter];
    expect(saved.updatedAt).not.toBe('2026-08-12T10:00:00.000Z');
  });

  it('updates the row immediately rather than waiting on the write', async () => {
    let release: () => void = () => {};
    const client = fakeClient([people[0]!], {
      save: vi.fn().mockImplementation(
        () =>
          new Promise<{ overflowed: boolean }>((resolve) => {
            release = () => resolve({ overflowed: false });
          }),
      ),
    });

    render(<RecruiterList client={client} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(
      screen.getByLabelText(/Outreach status for Ada Lovelace/i),
      'messaged',
    );

    // Waiting on a round trip to redraw a dropdown makes the list feel broken.
    expect(screen.getByLabelText(/Outreach status for Ada Lovelace/i)).toHaveValue('messaged');
    release();
  });

  it('reverts to stored state when the write fails', async () => {
    const client = fakeClient([people[0]!], {
      save: vi.fn().mockRejectedValue(new Error('sync is full')),
    });

    render(<RecruiterList client={client} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.selectOptions(
      screen.getByLabelText(/Outreach status for Ada Lovelace/i),
      'messaged',
    );

    // Leaving the row showing a change that never landed is worse than undoing
    // it visibly.
    await waitFor(() =>
      expect(screen.getByLabelText(/Outreach status for Ada Lovelace/i)).toHaveValue(
        'not-contacted',
      ),
    );
  });
});
