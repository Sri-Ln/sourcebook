import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReminderOptIn } from './ReminderOptIn.js';

const button = () => screen.getByRole('button', { name: /Turn on notifications/i });

describe('ReminderOptIn', () => {
  it('offers to enable reminders once something is scheduled', async () => {
    render(
      <ReminderOptIn
        hasScheduled
        check={vi.fn().mockResolvedValue(false)}
        request={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(await screen.findByText(/Reminders are off/i)).toBeDefined();
  });

  it('says nothing when nothing is scheduled', () => {
    render(
      <ReminderOptIn
        hasScheduled={false}
        check={vi.fn().mockResolvedValue(false)}
        request={vi.fn()}
      />,
    );

    // Asking before there is anything to be reminded about is how permission
    // prompts get declined out of hand.
    expect(screen.queryByText(/Reminders are off/i)).toBeNull();
  });

  it('says nothing once permission is granted', async () => {
    render(
      <ReminderOptIn hasScheduled check={vi.fn().mockResolvedValue(true)} request={vi.fn()} />,
    );

    await waitFor(() => expect(screen.queryByText(/Reminders are off/i)).toBeNull());
  });

  it('disappears after the request is accepted', async () => {
    render(
      <ReminderOptIn
        hasScheduled
        check={vi.fn().mockResolvedValue(false)}
        request={vi.fn().mockResolvedValue(true)}
      />,
    );
    await screen.findByText(/Reminders are off/i);

    await userEvent.click(button());

    await waitFor(() => expect(screen.queryByText(/Reminders are off/i)).toBeNull());
  });

  it('keeps offering when the request is declined', async () => {
    const request = vi.fn().mockResolvedValue(false);
    render(
      <ReminderOptIn hasScheduled check={vi.fn().mockResolvedValue(false)} request={request} />,
    );
    await screen.findByText(/Reminders are off/i);

    await userEvent.click(button());

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(screen.getByText(/Reminders are off/i)).toBeDefined();
  });

  it('stays quiet, and does not crash, when the capability check throws', async () => {
    // The permissions API is not available everywhere, and an unhandled
    // rejection here took down the whole test run once already. Offering to
    // enable something that may not exist is worse than not offering.
    render(
      <ReminderOptIn
        hasScheduled
        check={vi.fn().mockRejectedValue(new Error('not implemented'))}
        request={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByText(/Reminders are off/i)).toBeNull());
  });
});
