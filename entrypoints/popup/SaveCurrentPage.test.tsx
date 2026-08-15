import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDraft } from '../../lib/extractors/profile.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { SaveCurrentPage } from './SaveCurrentPage.js';

function fakeClient(overrides: Partial<RecruiterClient> = {}): RecruiterClient {
  return {
    list: vi.fn().mockResolvedValue({ recruiters: [], overflowedIds: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ overflowed: false }),
    usage: vi.fn().mockResolvedValue({ used: 0, quota: 102_400, fraction: 0 }),
    ...overrides,
  };
}

const draft: ProfileDraft = {
  name: 'Jane Placeholder',
  headline: 'Technical Recruiter at Placeholder Corp',
  profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
  memberId: 'ACoAAEXAMPLE',
  company: undefined,
  warnings: [],
};

function setup(over: Partial<Parameters<typeof SaveCurrentPage>[0]> = {}) {
  const client = over.client ?? fakeClient();
  const onSaved = vi.fn();
  render(
    <SaveCurrentPage
      client={client}
      inspect={vi.fn().mockResolvedValue({ savable: true, tabId: 7 })}
      requestDraft={vi.fn().mockResolvedValue(draft)}
      onSaved={onSaved}
      {...over}
    />,
  );
  return { client, onSaved };
}

const button = () => screen.getByRole('button');

describe('SaveCurrentPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enables the button on a savable page', async () => {
    setup();

    await waitFor(() => expect(button()).not.toBeDisabled());
  });

  it('explains why it is unavailable rather than just greying out', async () => {
    setup({
      inspect: vi.fn().mockResolvedValue({
        savable: false,
        reason: 'Open someone’s profile page, then try again.',
      }),
    });

    // A disabled control with no explanation reads as a bug.
    expect(await screen.findByText(/Open someone/)).toBeDefined();
    expect(button()).toBeDisabled();
  });

  it('saves in a single click, with no form in between', async () => {
    const { client, onSaved } = setup();
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());

    await waitFor(() => expect(client.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(onSaved).toHaveBeenCalled();
  });

  it('saves everything extraction found, including the company', async () => {
    const { client } = setup({
      requestDraft: vi.fn().mockResolvedValue({ ...draft, company: 'Placeholder Corp' }),
    });
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());

    await waitFor(() => expect(client.save).toHaveBeenCalled());
    expect(client.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Placeholder',
        company: 'Placeholder Corp',
        memberId: 'ACoAAEXAMPLE',
        outreach: 'not-contacted',
      }),
    );
  });

  it('confirms the save on the button', async () => {
    setup();
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());

    await waitFor(() => expect(button()).toHaveTextContent('Saved'));
    expect(button()).toBeDisabled();
  });

  it('reports an unreachable content script instead of failing silently', async () => {
    setup({
      requestDraft: vi
        .fn()
        .mockRejectedValue(new Error('Could not read the page. Try reloading the LinkedIn tab.')),
    });
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());

    // Happens when the tab predates the extension being installed or reloaded,
    // and the fix is something only the user can do.
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/reloading the LinkedIn tab/i)).toBeDefined();
  });

  it('offers a retry after a failure', async () => {
    const client = fakeClient({
      save: vi
        .fn()
        .mockRejectedValueOnce(new Error('sync is full'))
        .mockResolvedValue({ overflowed: false }),
    });
    setup({ client });
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());
    await waitFor(() => expect(button()).toHaveTextContent('Try again'));

    await userEvent.click(button());

    await waitFor(() => expect(button()).toHaveTextContent('Saved'));
  });
});
