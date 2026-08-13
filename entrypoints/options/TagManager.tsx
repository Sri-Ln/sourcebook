import { useState } from 'react';
import { collectTags, type TagUsage } from '../../lib/background/tags.js';
import type { DataClient } from '../../lib/messaging/client.js';
import type { Recruiter } from '../../lib/models/types.js';

interface TagManagerProps {
  client: DataClient;
  recruiters: Recruiter[];
  onChanged: () => void;
}

/** Which row, if any, is mid-edit. Only one at a time. */
type Editing =
  | { mode: 'none' }
  | { mode: 'rename'; tag: string; draft: string }
  | { mode: 'delete'; tag: string };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function TagManager({ client, recruiters, onChanged }: TagManagerProps) {
  const tags = collectTags(recruiters);

  const [editing, setEditing] = useState<Editing>({ mode: 'none' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * Runs a bulk change and reports the outcome either way.
   *
   * Both operations rewrite an unknown number of records, so "it worked" is not
   * enough — how many changed is the only way the user can tell a rename that
   * caught everything from one that caught half of it.
   */
  const apply = async (change: () => Promise<number>, describe: (changed: number) => string) => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);

    try {
      const changed = await change();
      setResult(describe(changed));
      setEditing({ mode: 'none' });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="tags-heading">
      <h2 id="tags-heading">Tags</h2>

      <p className="muted">
        Renaming or deleting a tag here changes every record carrying it. Merge two tags by
        renaming one to the other.
      </p>

      {tags.length === 0 ? (
        <p className="muted">
          No tags yet. Tag a recruiter from the popup and it will show up here.
        </p>
      ) : (
        <ul className="tags">
          {tags.map((usage) => (
            <li key={usage.tag} className="tag">
              <TagRow
                usage={usage}
                editing={editing}
                busy={busy}
                onStartRename={() =>
                  setEditing({ mode: 'rename', tag: usage.tag, draft: usage.tag })
                }
                onStartDelete={() => setEditing({ mode: 'delete', tag: usage.tag })}
                onDraft={(draft) => setEditing({ mode: 'rename', tag: usage.tag, draft })}
                onCancel={() => setEditing({ mode: 'none' })}
                onRename={(to) =>
                  void apply(
                    () => client.renameTag(usage.tag, to),
                    (changed) => `Renamed to “${to}” in ${plural(changed, 'record')}.`,
                  )
                }
                onDelete={() =>
                  void apply(
                    () => client.removeTag(usage.tag),
                    (changed) => `Removed “${usage.tag}” from ${plural(changed, 'record')}.`,
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {result ? <p className="notice">{result}</p> : null}

      {error ? (
        <div role="alert" className="notice notice--error">
          <p>That change did not go through.</p>
          <p className="muted">{error}</p>
        </div>
      ) : null}
    </section>
  );
}

interface TagRowProps {
  usage: TagUsage;
  editing: Editing;
  busy: boolean;
  onStartRename: () => void;
  onStartDelete: () => void;
  onDraft: (draft: string) => void;
  onCancel: () => void;
  onRename: (to: string) => void;
  onDelete: () => void;
}

function TagRow({
  usage,
  editing,
  busy,
  onStartRename,
  onStartDelete,
  onDraft,
  onCancel,
  onRename,
  onDelete,
}: TagRowProps) {
  const inputId = `rename-${usage.tag}`;

  if (editing.mode === 'rename' && editing.tag === usage.tag) {
    return (
      <form
        className="tag__edit"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(editing.draft.trim());
        }}
      >
        <label htmlFor={inputId}>New name for “{usage.tag}”</label>
        <input
          id={inputId}
          type="text"
          value={editing.draft}
          autoFocus
          onChange={(event) => onDraft(event.target.value)}
        />
        <button type="submit" disabled={busy || editing.draft.trim() === ''}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </form>
    );
  }

  if (editing.mode === 'delete' && editing.tag === usage.tag) {
    return (
      <div className="tag__edit">
        <p>
          Remove “{usage.tag}” from {plural(usage.count, 'record')}? The recruiters
          themselves are kept — only the tag goes.
        </p>
        <button type="button" className="danger" disabled={busy} onClick={onDelete}>
          Remove the tag
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Keep it
        </button>
      </div>
    );
  }

  return (
    <>
      <span className="tag__name">{usage.tag}</span>
      <span className="muted">{plural(usage.count, 'record')}</span>
      <button type="button" aria-label={`Rename ${usage.tag}`} onClick={onStartRename}>
        Rename
      </button>
      <button type="button" aria-label={`Delete ${usage.tag}`} onClick={onStartDelete}>
        Delete
      </button>
    </>
  );
}
