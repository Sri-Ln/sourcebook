import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  WEEKDAYS,
  addDays,
  addMonths,
  fullDateLabel,
  isIsoDate,
  isoParts,
  monthGrid,
  monthLabel,
  toWeeks,
} from '../../lib/ui/calendarMonth.js';
import { todayIso } from '../../lib/recruiters/followUp.js';

/**
 * The month-paging arrow.
 *
 * Drawn inside a square viewBox with the stroke centred in it, so the element's
 * box and the visible mark share a centre. That is the whole reason this is an
 * SVG: uniform padding around it is then genuinely uniform, with no per-side
 * correction to maintain. `currentColor` keeps it on the button's own colour
 * through hover and both themes.
 */
function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={`calendar__chevron${flip ? ' calendar__chevron--flip' : ''}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 1 4 6l4 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface FollowUpPickerProps {
  /** `YYYY-MM-DD`, or empty for no reminder. */
  value: string;
  onChange: (value: string) => void;
  /** Injected in tests so "today" is a fixed day rather than whenever it runs. */
  today?: string;
}

/**
 * The follow-up date control.
 *
 * A hand-built calendar rather than `input[type="date"]`, and rather than a
 * calendar package. The native control cannot be styled past its box — the
 * picker itself is drawn by the operating system, so it stayed stubbornly plain
 * next to everything else here. A library was the other option and was rejected
 * on weight: the ones worth using bring a date library and a timezone library
 * behind them, to produce the `YYYY-MM-DD` string this app already treats as its
 * currency. Same trade `StatusMenu` made against `<select>`.
 *
 * Owning it means owning what the native control gave away, so the keyboard map
 * is deliberate: arrows by day and week, Home and End to the ends of a week,
 * PageUp and PageDown by month, Enter or Space to choose, Escape to leave.
 */
export function FollowUpPicker({ value, onChange, today = todayIso() }: FollowUpPickerProps) {
  const selected = isIsoDate(value) ? value : '';

  const [open, setOpen] = useState(false);
  // Where the keyboard is, which is not the same as what is chosen: you page
  // around a calendar to look before you commit.
  const [cursor, setCursor] = useState(() => selected || today);

  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const dialogId = useId();

  const { year, month } = isoParts(cursor);
  const weeks = toWeeks(monthGrid(year, month));

  // Opening on the chosen date, or on today when there is none. Reopening where
  // you last paged to would be surprising a week later.
  const show = () => {
    setCursor(selected || today);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const choose = (iso: string) => {
    onChange(iso);
    setOpen(false);
    trigger.current?.focus();
  };

  // Lifted into the top layer, like the status menu: the panel scrolls, and a
  // calendar positioned inside a scrolling container gets clipped by it.
  useLayoutEffect(() => {
    const button = trigger.current;
    const panel = surface.current;
    if (!open || !button || !panel) return;

    panel.showPopover?.();

    const anchor = button.getBoundingClientRect();
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;

    // Flip above when there is no room below, so a card near the bottom of a
    // long list does not open its calendar off-screen.
    const room = window.innerHeight - anchor.bottom;
    const top = room < height + 8 ? anchor.top - height - 4 : anchor.bottom + 4;

    panel.style.top = `${Math.max(4, Math.min(top, window.innerHeight - height - 4))}px`;
    panel.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - width - 4))}px`;

    // Light dismiss closes the popover itself; React has to hear about it or the
    // trigger keeps claiming to be expanded.
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') setOpen(false);
    };
    panel.addEventListener('toggle', onToggle);

    return () => {
      panel.removeEventListener('toggle', onToggle);
      if (panel.isConnected) panel.hidePopover?.();
    };
  }, [open]);

  // Focus follows the cursor so a screen reader announces each day as you move.
  // aria-activedescendant is the alternative and is patchier in practice.
  useEffect(() => {
    if (!open) return;
    surface.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus();
  }, [open, cursor]);

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const step = (days: number) => {
      event.preventDefault();
      setCursor((current) => addDays(current, days));
    };

    switch (event.key) {
      case 'ArrowLeft':
        step(-1);
        break;
      case 'ArrowRight':
        step(1);
        break;
      case 'ArrowUp':
        step(-7);
        break;
      case 'ArrowDown':
        step(7);
        break;
      case 'Home': {
        // To Monday of the current week, not to the 1st: Home in a grid means
        // the start of the row.
        event.preventDefault();
        setCursor((current) => {
          const weekday = (new Date(`${current}T00:00:00Z`).getUTCDay() + 6) % 7;
          return addDays(current, -weekday);
        });
        break;
      }
      case 'End':
        event.preventDefault();
        setCursor((current) => {
          const weekday = (new Date(`${current}T00:00:00Z`).getUTCDay() + 6) % 7;
          return addDays(current, 6 - weekday);
        });
        break;
      case 'PageUp':
        event.preventDefault();
        setCursor((current) => addMonths(current, -1));
        break;
      case 'PageDown':
        event.preventDefault();
        setCursor((current) => addMonths(current, 1));
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(cursor);
        break;
      default:
        break;
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`datepick${selected ? '' : ' datepick--empty'}`}
        aria-label="Follow up on"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...(open ? { 'aria-controls': dialogId } : {})}
        onClick={() => (open ? close() : show())}
      >
        <span className="datepick__value">
          {selected ? fullDateLabel(selected) : 'No follow-up set'}
        </span>
        <span className="datepick__icon" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={surface}
          id={dialogId}
          popover="auto"
          className="calendar"
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
        >
          <div className="calendar__head">
            {/*
              An SVG rather than a "‹" glyph or a rotated bordered box.

              The glyph paints about 5px wide whatever its font-size, so making
              it bigger only inflated the button. The rotated box sized correctly
              but could not be centred without fudging: its ink sits on two edges
              of a square, so rotating leaves the mark off to one side and the
              correction is an eyeballed nudge. Here the drawing is centred
              inside its own square viewBox, so flex centring lands it exactly and
              uniform padding really is uniform.
            */}
            <button
              type="button"
              className="calendar__page"
              aria-label="Previous month"
              onClick={() => setCursor((current) => addMonths(current, -1))}
            >
              <Chevron />
            </button>

            {/* Announced on change so paging is audible, not just visible. */}
            <span id={labelId} className="calendar__month" aria-live="polite">
              {monthLabel(year, month)}
            </span>

            <button
              type="button"
              className="calendar__page"
              aria-label="Next month"
              onClick={() => setCursor((current) => addMonths(current, 1))}
            >
              <Chevron flip />
            </button>
          </div>

          {/* One tab stop for the whole grid, with arrows moving inside it --
              seven columns of tab stops would be a cruel way to reach a date. */}
          <div className="calendar__grid" role="grid" onKeyDown={onGridKeyDown}>
            <div className="calendar__week" role="row">
              {WEEKDAYS.map((weekday, index) => (
                <abbr
                  key={index}
                  role="columnheader"
                  className="calendar__weekday"
                  title={weekday.full}
                  aria-label={weekday.full}
                >
                  {weekday.short}
                </abbr>
              ))}
            </div>

            {weeks.map((week) => (
              <div key={week[0]?.iso} className="calendar__week" role="row">
                {week.map((day) => {
                  const isCursor = day.iso === cursor;
                  const isSelected = day.iso === selected;

                  return (
                    <button
                      key={day.iso}
                      type="button"
                      role="gridcell"
                      data-cursor={isCursor}
                      className="calendar__day"
                      // Only the cursor is tabbable, so Tab leaves the grid
                      // rather than walking 42 cells.
                      tabIndex={isCursor ? 0 : -1}
                      aria-selected={isSelected}
                      {...(day.iso === today ? { 'aria-current': 'date' as const } : {})}
                      aria-label={fullDateLabel(day.iso)}
                      data-outside={!day.inMonth}
                      data-today={day.iso === today}
                      onClick={() => choose(day.iso)}
                    >
                      {day.dayOfMonth}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="calendar__foot">
            <button
              type="button"
              className="link"
              // Without a way back to empty, cancelling a reminder would be
              // impossible and people would stop setting them.
              disabled={!selected}
              onClick={() => {
                onChange('');
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Clear
            </button>

            <button type="button" className="calendar__done" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
