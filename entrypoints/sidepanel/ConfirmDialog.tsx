import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  title: string;
  body: string;
  /** Verb and object, so the button says what it will do. */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A confirmation, in the panel rather than over the page.
 *
 * A native `<dialog>` opened with `showModal`, which is what earns the parts
 * that are tedious and easy to get wrong: the backdrop, the focus trap, Escape,
 * and inert content behind it. It also sits in the top layer, so it is not
 * clipped by the scrolling list that spawned it and needs no z-index at all.
 *
 * Cancel is focused first, not the destructive action. A dialog that opens with
 * "Remove" under the cursor and under Enter is a dialog that will delete things
 * for people who were only dismissing it.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    // Feature-detected rather than assumed: where showModal is missing the
    // dialog still renders and still works, just without the modal guarantees.
    if (element.showModal) element.showModal();
    else element.setAttribute('open', '');

    // Fires for Escape and for the close request, which `onCancel` owns so the
    // caller never has to distinguish "dismissed" from "declined".
    const onCancelEvent = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    element.addEventListener('cancel', onCancelEvent);

    return () => {
      element.removeEventListener('cancel', onCancelEvent);
      if (element.open) element.close();
    };
  }, [onCancel]);

  return (
    <dialog ref={dialog} className="confirm" aria-labelledby={titleId} aria-describedby={bodyId}>
      <h2 id={titleId} className="confirm__title">
        {title}
      </h2>

      <p id={bodyId} className="confirm__body">
        {body}
      </p>

      <div className="confirm__actions">
        <button type="button" autoFocus onClick={onCancel}>
          Cancel
        </button>

        <button type="button" className="confirm__danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
