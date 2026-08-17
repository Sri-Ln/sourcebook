import { useEffect, useId, useRef, useState } from 'react';
import { OUTREACH_STATUSES, type OutreachStatus } from '../../lib/models/types.js';
import { OUTREACH_LABELS } from './Filters.js';

export interface StatusMenuProps {
  value: OutreachStatus;
  /** Used for the accessible name, since the control repeats down the list. */
  personName: string;
  onChange: (status: OutreachStatus) => void;
}

/**
 * The outreach status control.
 *
 * A listbox rather than a `<select>`. A native select's menu is drawn by the
 * operating system and cannot be styled at all, so the open state stayed
 * stubbornly plain no matter what the closed pill looked like.
 *
 * The menu uses the popover API, which lifts it into the top layer. That is not
 * decoration: the panel scrolls, and a plainly-positioned menu inside a
 * scrolling container gets clipped by it.
 *
 * Replacing a native control means owning what it gave away for free, so the
 * keyboard behaviour here is deliberate rather than incidental.
 */
export function StatusMenu({ value, personName, onChange }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => OUTREACH_STATUSES.indexOf(value));

  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const toggle = () => {
    setActive(OUTREACH_STATUSES.indexOf(value));
    setOpen((wasOpen) => !wasOpen);
  };

  // Positioned on open rather than in CSS: the menu lives in the top layer, so
  // it no longer shares a coordinate space with the row that spawned it.
  useEffect(() => {
    const button = trigger.current;
    const list = menu.current;
    if (!open || !button || !list) return;

    // Progressive enhancement. Where the popover API exists the menu is lifted
    // into the top layer and cannot be clipped by the scrolling panel; where it
    // does not, the menu is still rendered and still works, just inside the
    // normal stacking context. Visibility is controlled by mounting, not by the
    // attribute, so an unsupported browser does not show it permanently.
    list.showPopover?.();

    const anchor = button.getBoundingClientRect();
    const height = list.offsetHeight;
    // Flip above when there is not room below, so the last rows in a long list
    // do not open off-screen.
    const below = window.innerHeight - anchor.bottom;
    const top = below < height + 8 ? anchor.top - height - 4 : anchor.bottom + 4;

    list.style.top = `${Math.max(4, top)}px`;
    list.style.left = `${Math.max(4, Math.min(anchor.right - list.offsetWidth, window.innerWidth - list.offsetWidth - 4))}px`;

    list.querySelector<HTMLElement>('[data-active="true"]')?.focus();

    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') setOpen(false);
    };
    list.addEventListener('toggle', onToggle);

    return () => {
      list.removeEventListener('toggle', onToggle);
      if (list.isConnected) list.hidePopover?.();
    };
  }, [open]);

  const choose = (status: OutreachStatus) => {
    setOpen(false);
    trigger.current?.focus();
    if (status !== value) onChange(status);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const last = OUTREACH_STATUSES.length - 1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => (i <= 0 ? last : i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const status = OUTREACH_STATUSES[active];
        if (status) choose(status);
        break;
      }
      default:
        break;
    }
  };

  // Focus follows the active option so the screen reader announces it, rather
  // than relying on aria-activedescendant, which is patchier in practice.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus();
  }, [open, active]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`status status--${value}`}
        aria-label={`Outreach status for ${personName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        /*
         * Click, not hover, and not pointerdown either.
         *
         * Hover cannot be the only trigger: keyboard and touch still need a
         * click, so it saves them nothing, and the pill sits in a dense row
         * where reaching for Edit or × drags the pointer straight across it.
         *
         * Opening on pointerdown was tried, to save the few milliseconds
         * between press and release. It breaks the focus handoff: the menu opens,
         * the effect below focuses the active option, and then mousedown's
         * default action pulls focus back to this button — so Escape and the
         * arrow keys go to the trigger and the menu stops responding. Suppressing
         * that needs preventDefault on the pointer events, which trades a
         * measurable few milliseconds for focus behaviour jsdom cannot verify.
         */
        onClick={toggle}
      >
        {OUTREACH_LABELS[value]}
        <span className="status__caret" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={menu}
          id={menuId}
          popover="auto"
          className="status-menu"
          role="listbox"
          // Distinct from the trigger's label: two elements answering to the
          // same name is ambiguous for a screen reader, and for anyone
          // querying by it.
          aria-label={`Choose status for ${personName}`}
          onKeyDown={onMenuKeyDown}
        >
          {OUTREACH_STATUSES.map((status, index) => (
            <button
              key={status}
              type="button"
              role="option"
              aria-selected={status === value}
              data-active={index === active}
              className={`status-menu__option status-menu__option--${status}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => choose(status)}
            >
              <span className="status-menu__dot" aria-hidden="true" />
              {OUTREACH_LABELS[status]}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
