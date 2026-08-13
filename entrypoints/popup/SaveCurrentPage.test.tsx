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

const button = () => screen.getByRole('button', { name: /Save current page/i });

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
    expect(await screen.findByText(/Open someone’s profile page/)).toBeDefined();
    expect(button()).toBeDisabled();
  });

  it('opens the shared panel prefilled from the tab', async () => {
    setup();
    await waitFor(() => expect(button()).not.toBeDisabled());

    await userEvent.click(button());

    const name = await screen.findByLabelText('Name');
    expect((name as HTMLInputElement).value).toBe('Jane Placeholder');
  });

  it('saves what the panel submits and tells the list to refresh', async () => {
    const { client, onSaved } = setup();
    await waitFor(() => expect(button()).not.toBeDisabled());
    await userEvent.click(button());
    await screen.findByLabelText('Name');

    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(client.save).toHaveBeenCalled());
    expect(client.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Placeholder',
        memberId: 'ACoAAEXAMPLE',
        outreach: 'not-contacted',
      }),
    );
    expect(onSaved).toHaveBeenCalled();
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

  it('closes the panel on cancel without saving', async () => {
    const { client } = setup();
    await waitFor(() => expect(button()).not.toBeDisabled());
    await userEvent.click(button());
    await screen.findByLabelText('Name');

    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    expect(client.save).not.toHaveBeenCalled();
  });
});
