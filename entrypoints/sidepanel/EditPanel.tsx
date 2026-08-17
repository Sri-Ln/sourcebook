import { useState } from 'react';
import { NOTE_MAX_LENGTH, type Recruiter } from '../../lib/models/types.js';
import { applyEdits, toEditValues, type EditValues } from '../../lib/recruiters/applyEdits.js';
import { FollowUpPicker } from './FollowUpPicker.js';

export interface EditPanelProps {
  recruiter: Recruiter;
  onSave: (updated: Recruiter) => Promise<void>;
  onCancel: () => void;
}

/**
 * The edit form.
 *
 * Saving is one click and asks nothing. This is for afterwards: the note you
 * meant to write, the tags you sort by, when to chase them, and the company if
 * extraction guessed it wrong.
 *
 * **Name, headline and "found via" are deliberately not here.** They were, and
 * they were noise: you do not retype someone's name, and a headline you would
 * correct is a headline you would rather not read. Company stays because it is
 * the axis the whole list is grouped by, so a wrong one is the one mistake that
 * actually costs you something — a person filed under "No company" is a person
 * you cannot find. Everything omitted is preserved untouched on save.
 *
 * React rather than the plain-DOM form this replaces: the calendar needs open,
 * cursor and month state, and reporting a save failure by reaching in with
 * `querySelector('.error')` was already the seam of the old approach showing.
 */
export function EditPanel({ recruiter, onSave, onCancel }: EditPanelProps) {
  const [values, setValues] = useState<EditValues>(() => toEditValues(recruiter));
  const [tagText, setTagText] = useState(() => recruiter.tags.join(', '));
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EditValues>(key: K, next: EditValues[K]) =>
    setValues((current) => ({ ...current, [key]: next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(undefined);

    try {
      await onSave(applyEdits(recruiter, values));
    } catch (caught) {
      // Kept in the form rather than thrown away. Losing a note someone just
      // typed because storage was full would be worse than the failure itself.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const noteLength = values.note.length;

  return (
    /* The wrapper is load-bearing rather than decoration. `.card` is a wrapping
       flex row, and `.card__edit`'s flex-basis: 100% is what drops the form onto
       a line of its own. Without it the form becomes a third item in that row,
       crushed between the name and the action buttons. */
    <div className="card__edit">
      <form className="edit-form" onSubmit={submit}>
        <label className="field">
          <span>Company</span>
          <input
            type="text"
            aria-label="Company"
            placeholder="Where they work"
            value={values.company}
            onChange={(event) => set('company', event.target.value)}
          />
        </label>

        <label className="field">
          <span>Note</span>
          <textarea
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            aria-label="Note"
            placeholder="Why they matter, what they were hiring for…"
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
            // Focused on open: it is the field you came here for.
            autoFocus
          />
        </label>

        <label className="field">
          <span>Tags</span>
          <input
            type="text"
            aria-label="Tags"
            placeholder="fintech, sponsors-h1b"
            value={tagText}
            // Split on save, not per keystroke, so a half-typed tag is not
            // repeatedly torn apart while you type it.
            onChange={(event) => {
              setTagText(event.target.value);
              set(
                'tags',
                event.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              );
            }}
          />
        </label>

        <div className="field">
          <span className="field__label">Follow up on</span>
          <FollowUpPicker value={values.followUpAt} onChange={(next) => set('followUpAt', next)} />
        </div>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="edit-form__actions">
          {/* Shown live rather than enforced on submit: notes sync to a namespace
              with a hard byte ceiling, and discovering the limit after writing is
              worse than seeing it while you write. */}
          <span className={`counter${noteLength >= NOTE_MAX_LENGTH ? ' counter--full' : ''}`}>
            {noteLength}/{NOTE_MAX_LENGTH}
          </span>

          <button type="button" onClick={onCancel}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </form>
    </div>
  );
}
