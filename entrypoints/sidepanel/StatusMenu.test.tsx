import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusMenu } from './StatusMenu.js';

function setup(value: Parameters<typeof StatusMenu>[0]['value'] = 'not-contacted') {
  const onChange = vi.fn();
  render(<StatusMenu value={value} personName="Jane Placeholder" onChange={onChange} />);
  return { onChange };
}

const trigger = () => screen.getByRole('button', { name: /Outreach status for Jane/i });

describe('StatusMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the current status on the trigger', () => {
    setup('messaged');

    expect(trigger()).toHaveTextContent('Messaged');
  });

  it('keeps the menu closed until asked', () => {
    setup();

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens a listbox of every status', async () => {
    setup();

    await userEvent.click(trigger());

    expect(await screen.findByRole('listbox')).toBeDefined();
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('marks the current status as selected', async () => {
    setup('replied');

    await userEvent.click(trigger());

    expect(await screen.findByRole('option', { name: 'Replied' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('reports the chosen status and closes', async () => {
    const { onChange } = setup();

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('option', { name: 'Messaged' }));

    expect(onChange).toHaveBeenCalledWith('messaged');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('does not report a change when the current status is re-picked', async () => {
    const { onChange } = setup('messaged');

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole('option', { name: 'Messaged' }));

    // A pointless write costs a sync quota slot and a rate-limit budget entry.
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('keyboard', () => {
    it('closes on Escape without changing anything', async () => {
      const { onChange } = setup();
      await userEvent.click(trigger());
      await screen.findByRole('listbox');

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
      expect(onChange).not.toHaveBeenCalled();
    });

    it('moves through the options with the arrow keys and picks with Enter', async () => {
      const { onChange } = setup('not-contacted');
      await userEvent.click(trigger());
      await screen.findByRole('listbox');

      // Replacing a native control means owning the keyboard behaviour it gave
      // away for free.
      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith('messaged');
    });

    it('wraps from the last option back to the first', async () => {
      const { onChange } = setup('closed');
      await userEvent.click(trigger());
      await screen.findByRole('listbox');

      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith('not-contacted');
    });

    it('jumps to the last option with End', async () => {
      const { onChange } = setup('not-contacted');
      await userEvent.click(trigger());
      await screen.findByRole('listbox');

      await userEvent.keyboard('{End}{Enter}');

      expect(onChange).toHaveBeenCalledWith('closed');
    });
  });

  it('tells assistive technology whether the menu is open', async () => {
    setup();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger());

    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'true'));
  });
});
