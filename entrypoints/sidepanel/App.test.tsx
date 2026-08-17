import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import { UNKNOWN_COMPANY } from '../../lib/recruiters/groupByCompany.js';

const list = vi.fn();
const save = vi.fn();
const remove = vi.fn();

vi.mock('../../lib/messaging/client.js', () => ({
  recruiterClient: {
    list: (...args: unknown[]) => list(...args),
    save: (...args: unknown[]) => save(...args),
    remove: (...args: unknown[]) => remove(...args),
    usage: vi.fn().mockResolvedValue({ used: 0, quota: 102_400, fraction: 0 }),
  },
  sortForDisplay: (r: Recruiter[]) => r,
}));

vi.mock('../../lib/messaging/activeTab.js', () => ({
  inspectActiveTab: vi.fn().mockResolvedValue({ savable: false, reason: 'Not a profile.' }),
  requestDraft: vi.fn(),
}));

// fakeBrowser does not implement permissions.contains, and an unhandled
// rejection from the effect fails the run even though every assertion passes.
vi.mock('../../lib/messaging/notifications.js', () => ({
  hasReminderPermission: vi.fn().mockResolvedValue(true),
  requestReminderPermission: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/recruiters/filterStore.js', () => ({
  filterStore: {
    load: vi.fn().mockResolvedValue({ query: '', statuses: [], tags: [] }),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));

const { default: App } = await import('./App.js');

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    headline: 'Technical Recruiter',
    company: 'Stripe',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

/** Opens the status menu for someone and picks an option. */
async function chooseStatus(person: string, label: string) {
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(`Outreach status for ${person}`, 'i') }),
  );
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

function loaded(recruiters: Recruiter[], overflowedIds: string[] = []) {
  list.mockResolvedValue({ recruiters, overflowedIds });
}

describe('side panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ overflowed: false });
    remove.mockResolvedValue(undefined);
    loaded([]);
  });

  it('explains how to start when nothing is saved', async () => {
    render(<App />);

    expect(await screen.findByText(/Nothing saved yet/i)).toBeDefined();
  });

  it('surfaces a load failure rather than showing an empty list', async () => {
    list.mockRejectedValue(new Error('The background worker did not respond.'));

    render(<App />);

    // Empty and broken look identical, and the difference matters a great deal
    // to someone who has saved forty people.
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  describe('grouping', () => {
    it('groups people under their company', async () => {
      loaded([
        recruiter({ name: 'At Stripe', company: 'Stripe' }),
        recruiter({ name: 'At Postman', company: 'Postman' }),
      ]);

      render(<App />);

      expect(await screen.findByRole('heading', { name: /Postman/ })).toBeDefined();
      expect(screen.getByRole('heading', { name: /Stripe/ })).toBeDefined();
    });

    it('counts how many people are at each company', async () => {
      loaded([
        recruiter({ name: 'One', company: 'Stripe' }),
        recruiter({ name: 'Two', company: 'Stripe' }),
      ]);

      render(<App />);

      const heading = await screen.findByRole('heading', { name: /Stripe/ });
      expect(heading.textContent).toContain('2');
    });

    it('collects people with no company under a heading of their own', async () => {
      loaded([recruiter({ company: undefined })]);

      render(<App />);

      // The accessible name carries the count too, so match loosely.
      expect(
        await screen.findByRole('heading', { name: new RegExp(UNKNOWN_COMPANY) }),
      ).toBeDefined();
    });
  });

  describe('cards', () => {
    it('shows the name and the role, and not the rest of the record', async () => {
      loaded([
        recruiter({
          name: 'Jane Placeholder',
          headline: 'Technical Recruiter',
          note: 'A note nobody needs while scanning',
          tags: ['fintech'],
        }),
      ]);

      render(<App />);

      expect(await screen.findByText('Jane Placeholder')).toBeDefined();
      expect(screen.getByText('Technical Recruiter')).toBeDefined();
      // A list you scan is only useful if there is little to read per row.
      expect(screen.queryByText(/A note nobody needs/)).toBeNull();
    });

    it('links to the profile in a new tab', async () => {
      loaded([recruiter()]);

      render(<App />);

      const link = (await screen.findByText('Jane Placeholder')) as HTMLAnchorElement;
      expect(link.target).toBe('_blank');
    });

    it('flags a record that only saved locally', async () => {
      const jane = recruiter({ id: 'local-only' });
      loaded([jane], ['local-only']);

      render(<App />);

      expect(await screen.findByTitle(/Sync storage is full/i)).toBeDefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      loaded([
        recruiter({ name: 'Ada Lovelace', company: 'Stripe' }),
        recruiter({ name: 'Grace Hopper', company: 'Postman', note: 'backend openings' }),
      ]);
    });

    it('filters across the whole list, not just one group', async () => {
      render(<App />);
      await screen.findByText('Ada Lovelace');

      await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'grace');

      await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull());
      expect(screen.getByText('Grace Hopper')).toBeDefined();
    });

    it('searches notes, which are not shown on the card', async () => {
      render(<App />);
      await screen.findByText('Grace Hopper');

      await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'backend');

      await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull());
      expect(screen.getByText('Grace Hopper')).toBeDefined();
    });

    it('drops a company heading once nobody in it matches', async () => {
      render(<App />);
      await screen.findByText('Ada Lovelace');

      await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'grace');

      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: /Stripe/ })).toBeNull(),
      );
    });

    it('offers a way out when nothing matches', async () => {
      render(<App />);
      await screen.findByText('Ada Lovelace');

      await userEvent.type(screen.getByLabelText(/Search saved recruiters/i), 'nobody');

      await userEvent.click(await screen.findByRole('button', { name: /Clear/i }));

      expect(await screen.findByText('Ada Lovelace')).toBeDefined();
    });
  });

  describe('editing from the list', () => {
    it('changes outreach status', async () => {
      const jane = recruiter({ id: 'jane' });
      loaded([jane]);

      render(<App />);
      await screen.findByText('Jane Placeholder');

      await chooseStatus('Jane Placeholder', 'Messaged');

      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'jane', outreach: 'messaged' }),
      );
    });

    it('advances updatedAt when status changes', async () => {
      loaded([recruiter({ id: 'jane' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');

      await chooseStatus('Jane Placeholder', 'Referred');

      await waitFor(() => expect(save).toHaveBeenCalled());
      const [saved] = save.mock.calls[0] as [Recruiter];
      expect(saved.updatedAt).not.toBe('2026-08-12T10:00:00.000Z');
    });

    it('reverts to stored state when the write fails', async () => {
      loaded([recruiter({ id: 'jane' })]);
      save.mockRejectedValue(new Error('sync is full'));

      render(<App />);
      await screen.findByText('Jane Placeholder');

      await chooseStatus('Jane Placeholder', 'Messaged');

      // Leaving a change on screen that never landed is worse than undoing it.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Outreach status for Jane Placeholder/i }),
        ).toHaveTextContent('Not contacted'),
      );
    });

    it('opens an edit form from a card', async () => {
      loaded([recruiter({ id: 'jane' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');

      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));

      expect(await screen.findByLabelText('Note')).toBeDefined();
    });

    it('writes a note, which nothing else in the app can do', async () => {
      loaded([recruiter({ id: 'jane' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));

      await userEvent.type(await screen.findByLabelText('Note'), 'Posted about backend openings');
      await userEvent.click(screen.getByRole('button', { name: /Update/i }));

      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'jane', note: 'Posted about backend openings' }),
      );
    });

    it('adds tags', async () => {
      loaded([recruiter({ id: 'jane', tags: [] })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));

      await userEvent.type(await screen.findByLabelText('Tags'), 'fintech, remote');
      await userEvent.click(screen.getByRole('button', { name: /Update/i }));

      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['fintech', 'remote'] }),
      );
    });

    it('corrects a company the extractor guessed wrong', async () => {
      loaded([recruiter({ id: 'jane', company: 'Ramapo College' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));

      const company = await screen.findByLabelText('Company');
      await userEvent.clear(company);
      await userEvent.type(company, 'Postman');
      await userEvent.click(screen.getByRole('button', { name: /Update/i }));

      await waitFor(() => expect(save).toHaveBeenCalled());
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ company: 'Postman' }));
    });

    it('preserves identity when editing', async () => {
      loaded([recruiter({ id: 'jane', memberId: 'ACoAAEXAMPLE' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));
      await userEvent.type(await screen.findByLabelText('Note'), 'x');
      await userEvent.click(screen.getByRole('button', { name: /Update/i }));

      await waitFor(() => expect(save).toHaveBeenCalled());
      // Changing these would orphan the record or defeat dedupe.
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'jane',
          memberId: 'ACoAAEXAMPLE',
          profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
          savedAt: '2026-08-12T10:00:00.000Z',
        }),
      );
    });

    it('closes the form on cancel without saving', async () => {
      loaded([recruiter({ id: 'jane' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));
      await screen.findByLabelText('Note');

      await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      await waitFor(() => expect(screen.queryByLabelText('Note')).toBeNull());
      expect(save).not.toHaveBeenCalled();
    });

    it('keeps the form open and shows why when saving fails', async () => {
      loaded([recruiter({ id: 'jane' })]);
      save.mockRejectedValue(new Error('sync is full'));

      render(<App />);
      await screen.findByText('Jane Placeholder');
      await userEvent.click(screen.getByRole('button', { name: /Edit Jane Placeholder/i }));
      await userEvent.type(await screen.findByLabelText('Note'), 'Worth keeping');
      await userEvent.click(screen.getByRole('button', { name: /Update/i }));

      // Losing a note someone just typed would be worse than the failure.
      expect(await screen.findByText(/sync is full/)).toBeDefined();
      expect(screen.getByLabelText('Note')).toHaveValue('Worth keeping');
    });

    it('removes a recruiter once the removal is confirmed', async () => {
      loaded([recruiter({ id: 'jane' })]);

      render(<App />);
      await screen.findByText('Jane Placeholder');

      await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));
      await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      expect(remove).toHaveBeenCalledWith('jane');
    });

    describe('confirming a removal', () => {
      it('asks before removing anything', async () => {
        loaded([recruiter({ id: 'jane' })]);

        render(<App />);
        await screen.findByText('Jane Placeholder');

        await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));

        // The × sits a pixel from Edit on a row you were only scanning, and
        // removal destroys a note the page cannot reconstruct.
        expect(await screen.findByRole('dialog')).toBeDefined();
        expect(remove).not.toHaveBeenCalled();
      });

      it('names the person, so you know what you are about to lose', async () => {
        loaded([recruiter({ id: 'jane' })]);

        render(<App />);
        await screen.findByText('Jane Placeholder');

        await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));

        expect(await screen.findByRole('dialog')).toHaveAccessibleName(
          /Remove Jane Placeholder\?/i,
        );
      });

      it('keeps the recruiter when cancelled', async () => {
        loaded([recruiter({ id: 'jane' })]);

        render(<App />);
        await screen.findByText('Jane Placeholder');

        await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));
        await userEvent.click(await screen.findByRole('button', { name: /Cancel/i }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(remove).not.toHaveBeenCalled();
        expect(screen.getByText('Jane Placeholder')).toBeDefined();
      });

      it('opens with Cancel focused rather than the destructive action', async () => {
        loaded([recruiter({ id: 'jane' })]);

        render(<App />);
        await screen.findByText('Jane Placeholder');

        await userEvent.click(screen.getByRole('button', { name: /Remove Jane Placeholder/i }));

        // A dialog that opens with Remove under Enter deletes things for people
        // who were only dismissing it.
        await waitFor(() =>
          expect(screen.getByRole('button', { name: /Cancel/i })).toHaveFocus(),
        );
      });

      it('confirms the right person when several are saved', async () => {
        loaded([
          recruiter({ id: 'jane', name: 'Jane Placeholder' }),
          recruiter({ id: 'sam', name: 'Sam Example' }),
        ]);

        render(<App />);
        await screen.findByText('Sam Example');

        await userEvent.click(screen.getByRole('button', { name: /Remove Sam Example/i }));
        await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

        expect(remove).toHaveBeenCalledWith('sam');
        expect(remove).toHaveBeenCalledTimes(1);
      });
    });
  });
});
