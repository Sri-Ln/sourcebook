import { useMemo, useState } from 'react';
import { NOTE_MAX_LENGTH, type Recruiter } from '../../lib/models/types.js';
import { applyEdits, toEditValues, type EditValues } from '../../lib/recruiters/applyEdits.js';
import { activeFragment, suggestTags, withTag } from '../../lib/recruiters/tagSuggestions.js';
import { FollowUpPicker } from './FollowUpPicker.js';

export interface EditPanelProps {
  recruiter: Recruiter;
  /**
   * Every tag in use, most-used first, from {@link rankTags}. Passed in rather
   * than derived here because it is drawn from the whole collection, not from
   * the one record being edited.
   */
  tagSuggestions?: readonly string[];
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
export function EditPanel({
  recruiter,
  tagSuggestions = [],
  onSave,
  onCancel,
}: EditPanelProps) {
  const [values, setValues] = useState<EditValues>(() => toEditValues(recruiter));
  /**
   * Seeded with a trailing separator when there are tags already.
   *
   * Without it the field opens as "fintech, backend" and `activeFragment` reads
   * "backend" — so the suggestion row starts in matching mode against the tag
   * this person already has, and offers nothing. The separator also means the
   * next tag can be typed immediately. Empty entries are dropped on save.
   */
  const [tagText, setTagText] = useState(() =>
    recruiter.tags.length > 0 ? `${recruiter.tags.join(', ')}, ` : '',
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  /**
   * Three at rest, more once you start typing.
   *
   * The resting row is a shortcut, and a shortcut with twenty options in it is
   * just a list. Typing switches it to matches drawn from every tag you have
   * used, which is how the ones outside the top three stay reachable.
   */
  const fragment = activeFragment(tagText);
  const suggestions = useMemo(
    () => suggestTags({ ranked: tagSuggestions, applied: values.tags, fragment }),
    [tagSuggestions, values.tags, fragment],
  );

  const set = <K extends keyof EditValues>(key: K, next: EditValues[K]) =>
    setValues((current) => ({ ...current, [key]: next }));

  /** The field's text is what you typed; `values.tags` is what will be saved. */
  const setTags = (text: string) => {
    setTagText(text);
    set(
      'tags',
      text
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  };

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
            onChange={(event) => setTags(event.target.value)}
          />
        </label>

        {/* Outside the label, because a label may only name one control and
            these are buttons in their own right. Absent entirely until there is
            something to suggest, so a first-time panel shows no empty row. */}
        {suggestions.length > 0 ? (
          <div
            className="tag-suggest"
            role="group"
            aria-label={fragment ? `Tags matching ${fragment}` : 'Most used tags'}
          >
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag-suggest__chip"
                // Named for what pressing it does, since "fintech" alone does
                // not say that out loud.
                aria-label={`Add tag ${tag}`}
                onClick={() => setTags(withTag(tagText, tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}

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
