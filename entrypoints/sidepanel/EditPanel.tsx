import { useEffect, useRef } from 'react';
import type { Recruiter } from '../../lib/models/types.js';
import { applyEdits, toPanelValues } from '../../lib/recruiters/applyEdits.js';
import { createSavePanel } from '../../lib/ui/savePanel.js';

export interface EditPanelProps {
  recruiter: Recruiter;
  onSave: (updated: Recruiter) => Promise<void>;
  onCancel: () => void;
}

/**
 * Mounts the plain-DOM edit form inside the React tree.
 *
 * The form is shared with nothing else right now, but it is the only place in
 * the app that can write a note, a tag, or a corrected company — saving itself
 * is one click and deliberately asks no questions.
 */
export function EditPanel({ recruiter, onSave, onCancel }: EditPanelProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    const form = createSavePanel({
      initial: toPanelValues(recruiter),
      submitLabel: 'Update',
      onCancel,
      onSubmit: async (values) => {
        try {
          await onSave(applyEdits(recruiter, values));
        } catch (error) {
          // Reported in the form so the edit is not discarded. Losing a note
          // someone just typed because storage was full would be worse than
          // the failure itself.
          const message = form.querySelector<HTMLElement>('.error');
          if (message) {
            message.textContent = error instanceof Error ? error.message : String(error);
            message.hidden = false;
          }
        }
      },
    });

    container.replaceChildren(form);
    form.querySelector('textarea')?.focus();

    return () => container.replaceChildren();
  }, [recruiter, onSave, onCancel]);

  return <div className="card__edit" ref={host} />;
}
