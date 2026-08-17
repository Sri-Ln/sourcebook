import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fullDateLabel } from '../../lib/ui/calendarMonth.js';
import { FollowUpPicker } from './FollowUpPicker.js';

/** Fixed, so "today" is a known Saturday rather than whenever the suite runs. */
const TODAY = '2026-09-12';

function setup(value = '') {
  const onChange = vi.fn();
  const view = render(<FollowUpPicker value={value} onChange={onChange} today={TODAY} />);
  return { onChange, rerender: (next: string) => view.rerender(
    <FollowUpPicker value={next} onChange={onChange} today={TODAY} />,
  ) };
}

const trigger = () => screen.getByRole('button', { name: 'Follow up on' });
const open = async () => {
  await userEvent.click(trigger());
  return screen.findByRole('dialog');
};
/**
 * Looked up by the label the component actually renders, rather than a spelling
 * of it. Date order is the host locale's business: "Sep 12, 2026" and
 * "12 Sep 2026" are the same day, and hard-coding either makes the suite fail on
 * a machine configured the other way.
 */
const day = (iso: string) => screen.getByRole('gridcell', { name: fullDateLabel(iso) });

describe('FollowUpPicker', () => {
  describe('the trigger', () => {
    it('says so plainly when no date is set', () => {
      setup();

      expect(trigger()).toHaveTextContent(/No follow-up set/i);
    });

    it('reads back the chosen date', () => {
      setup('2026-09-12');

      // Formatted in UTC. Local formatting of a UTC midnight shows the previous
      // day for anyone west of Greenwich.
      expect(trigger()).toHaveTextContent(/12/);
      expect(trigger()).toHaveTextContent(/Sep/);
      expect(trigger()).toHaveTextContent(/2026/);
    });

    it('treats a stored value it cannot parse as no date', () => {
      // Stored values are untrusted like anything else on disk; a bad one must
      // read as unset rather than crash the form open.
      setup('not-a-date');

      expect(trigger()).toHaveTextContent(/No follow-up set/i);
    });

    it('starts closed', () => {
      setup();

      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('opening', () => {
    it('opens on the chosen month', async () => {
      setup('2026-11-20');
      await open();

      expect(screen.getByText(/November 2026/)).toBeDefined();
    });

    it('opens on today when nothing is chosen', async () => {
      setup();
      await open();

      expect(screen.getByText(/September 2026/)).toBeDefined();
    });

    it('parks the keyboard on today when nothing is chosen', async () => {
      setup();
      await open();

      // So the calendar opens ready to move out from today, and Enter alone
      // picks it. Today is also washed in accent, which is what makes the
      // starting point visible rather than merely true.
      await waitFor(() => expect(day(TODAY)).toHaveAttribute('data-cursor', 'true'));
      expect(day(TODAY)).toHaveAttribute('aria-current', 'date');
    });

    it('marks today even when another date is chosen', async () => {
      setup('2026-09-20');
      await open();

      // Two questions, two marks: today stays identifiable while the selection
      // is elsewhere.
      expect(day(TODAY)).toHaveAttribute('aria-current', 'date');
      expect(day('2026-09-20')).toHaveAttribute('aria-selected', 'true');
      expect(day('2026-09-20')).toHaveAttribute('data-cursor', 'true');
    });

    it('marks today, distinctly from the selection', async () => {
      setup('2026-09-20');
      await open();

      // Two different questions -- "where are we" and "what did I pick" -- so
      // two different marks rather than two shades of one.
      expect(day('2026-09-12')).toHaveAttribute('aria-current', 'date');
      expect(day('2026-09-12')).toHaveAttribute('aria-selected', 'false');
      expect(day('2026-09-20')).toHaveAttribute('aria-selected', 'true');
    });

    it('shows six whole weeks so the popover does not jump when paging', async () => {
      setup();
      await open();

      expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    });

    it('labels every weekday column in full', async () => {
      setup();
      await open();

      // "T" and "S" each appear twice, so the letter alone is ambiguous read
      // aloud.
      expect(screen.getByRole('columnheader', { name: 'Thursday' })).toBeDefined();
      expect(screen.getByRole('columnheader', { name: 'Sunday' })).toBeDefined();
    });
  });

  describe('choosing a date', () => {
    it('reports the date and closes', async () => {
      const { onChange } = setup();
      await open();

      await userEvent.click(day('2026-09-24'));

      expect(onChange).toHaveBeenCalledWith('2026-09-24');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('returns focus to the trigger, not to nothing', async () => {
      setup();
      await open();

      await userEvent.click(day('2026-09-24'));

      await waitFor(() => expect(trigger()).toHaveFocus());
    });

    it('can pick a day borrowed from the next month', async () => {
      const { onChange } = setup();
      await open();

      // The trailing days are real dates, which is how you reach the 1st of
      // next month without paging.
      await userEvent.click(day('2026-10-01'));

      expect(onChange).toHaveBeenCalledWith('2026-10-01');
    });
  });

  describe('paging months', () => {
    it('goes forward and back', async () => {
      setup();
      await open();

      await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
      expect(screen.getByText(/October 2026/)).toBeDefined();

      await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText(/September 2026/)).toBeDefined();
    });

    it('crosses a year boundary', async () => {
      setup('2026-12-15');
      await open();

      await userEvent.click(screen.getByRole('button', { name: 'Next month' }));

      expect(screen.getByText(/January 2027/)).toBeDefined();
    });

    it('does not choose anything just by paging', async () => {
      const { onChange } = setup();
      await open();

      await userEvent.click(screen.getByRole('button', { name: 'Next month' }));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  /**
   * Replacing a native control means owning what it gave away for free, so this
   * is asserted rather than assumed.
   */
  describe('keyboard', () => {
    it('moves a day at a time', async () => {
      setup('2026-09-12');
      await open();

      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(day('2026-09-13')).toHaveFocus());

      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
      await waitFor(() => expect(day('2026-09-11')).toHaveFocus());
    });

    it('moves a week at a time', async () => {
      setup('2026-09-12');
      await open();

      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(day('2026-09-19')).toHaveFocus());

      await userEvent.keyboard('{ArrowUp}{ArrowUp}');
      await waitFor(() => expect(day('2026-09-05')).toHaveFocus());
    });

    it('pages months with PageUp and PageDown', async () => {
      setup('2026-09-12');
      await open();

      await userEvent.keyboard('{PageDown}');
      await waitFor(() => expect(screen.getByText(/October 2026/)).toBeDefined());

      await userEvent.keyboard('{PageUp}{PageUp}');
      await waitFor(() => expect(screen.getByText(/August 2026/)).toBeDefined());
    });

    it('goes to the ends of the week with Home and End', async () => {
      // 12 September 2026 is a Saturday, in a Monday-first grid.
      setup('2026-09-12');
      await open();

      await userEvent.keyboard('{Home}');
      await waitFor(() => expect(day('2026-09-07')).toHaveFocus());

      await userEvent.keyboard('{End}');
      await waitFor(() => expect(day('2026-09-13')).toHaveFocus());
    });

    it('crosses a month boundary by arrow', async () => {
      setup('2026-09-30');
      await open();

      await userEvent.keyboard('{ArrowRight}');

      await waitFor(() => expect(screen.getByText(/October 2026/)).toBeDefined());
    });

    it('chooses with Enter', async () => {
      const { onChange } = setup('2026-09-12');
      await open();

      await userEvent.keyboard('{ArrowRight}{Enter}');

      expect(onChange).toHaveBeenCalledWith('2026-09-13');
    });

    it('leaves without choosing on Escape', async () => {
      const { onChange } = setup('2026-09-12');
      await open();

      await userEvent.keyboard('{ArrowRight}{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(onChange).not.toHaveBeenCalled();
      expect(trigger()).toHaveFocus();
    });

    it('keeps one tab stop for the whole grid', async () => {
      setup('2026-09-12');
      await open();

      // Seven columns of tab stops would be a cruel way to reach a date.
      const tabbable = screen
        .getAllByRole('gridcell')
        .filter((cell) => cell.getAttribute('tabindex') === '0');

      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAccessibleName(fullDateLabel('2026-09-12'));
    });
  });

  describe('clearing', () => {
    it('clears an existing date', async () => {
      const { onChange } = setup('2026-09-12');
      await open();

      await userEvent.click(screen.getByRole('button', { name: /Clear/i }));

      // Being unable to cancel a reminder would make people avoid setting one.
      expect(onChange).toHaveBeenCalledWith('');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('offers nothing to clear when no date is set', async () => {
      setup();
      await open();

      expect(screen.getByRole('button', { name: /Clear/i })).toBeDisabled();
    });
  });

  it('reopens on the chosen date rather than where paging left off', async () => {
    const { rerender } = setup('2026-09-12');
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await userEvent.keyboard('{Escape}');
    rerender('2026-09-12');

    await open();

    // Reopening in December because you browsed there last week would be
    // surprising rather than helpful.
    expect(screen.getByText(/September 2026/)).toBeDefined();
  });
});
