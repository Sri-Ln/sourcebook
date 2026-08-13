import { useRef, useState } from 'react';
import {
  archiveFilename,
  buildArchive,
  planImport,
  serialiseArchive,
  type ImportPlan,
} from '../../lib/background/archive.js';
import type { DataClient } from '../../lib/messaging/client.js';
import type { ImportSummary } from '../../lib/background/RecruiterStore.js';
import type { Recruiter } from '../../lib/models/types.js';
import { downloadText } from './download.js';

type ReadablePlan = Extract<ImportPlan, { ok: true }>;

type ImportState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'planned'; plan: ReadablePlan; filename: string }
  | { status: 'unreadable'; errors: string[] }
  | { status: 'writing' }
  | { status: 'done'; summary: ImportSummary }
  | { status: 'failed'; message: string };

interface ImportExportProps {
  client: DataClient;
  recruiters: Recruiter[];
  onChanged: () => void;
  /** Injected in tests; a real download needs a browser. */
  download?: (filename: string, contents: string) => void;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function ImportExport({
  client,
  recruiters,
  onChanged,
  download = downloadText,
}: ImportExportProps) {
  const [exported, setExported] = useState<number | undefined>(undefined);
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  // Cleared after every read so choosing the same file twice still fires a
  // change event — otherwise a user who fixes their file and re-picks it sees
  // nothing happen.
  const fileInput = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    download(archiveFilename(), serialiseArchive(buildArchive(recruiters)));
    setExported(recruiters.length);
  };

  const readFile = async (file: File) => {
    setState({ status: 'reading' });

    const text = await file.text();
    const plan = planImport(text, recruiters);

    if (fileInput.current) fileInput.current.value = '';

    setState(plan.ok ? { status: 'planned', plan, filename: file.name } : { status: 'unreadable', errors: plan.errors });
  };

  const commit = async (plan: ReadablePlan) => {
    setState({ status: 'writing' });

    try {
      const summary = await client.importRecruiters(plan.records);
      setState({ status: 'done', summary });
      onChanged();
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section className="panel" aria-labelledby="transfer-heading">
      <h2 id="transfer-heading">Export and import</h2>

      <p className="muted">
        Everything you have saved, as plain JSON. No storage backend should ever be a
        prison: if you stop using sourcebook tomorrow, your records leave with you in a
        format you can read.
      </p>

      <div className="actions">
        <button type="button" onClick={exportAll} disabled={recruiters.length === 0}>
          Export all data
        </button>
        {exported !== undefined ? (
          <span className="muted">Exported {plural(exported, 'record')}.</span>
        ) : null}
      </div>

      <hr />

      <div className="field">
        <label htmlFor="import-file">Import from a JSON file</label>
        <input
          id="import-file"
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-describedby="import-help"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
        <p id="import-help" className="muted">
          Choose a file to see what importing it would do. Nothing is written until you
          confirm.
        </p>
      </div>

      {state.status === 'reading' ? <p className="muted">Reading…</p> : null}

      {state.status === 'unreadable' ? (
        <div role="alert" className="notice notice--error">
          <p>That file could not be read.</p>
          {state.errors.map((error) => (
            <p key={error} className="muted">
              {error}
            </p>
          ))}
        </div>
      ) : null}

      {state.status === 'planned' ? <Preview plan={state.plan} onConfirm={commit} onCancel={() => setState({ status: 'idle' })} /> : null}

      {state.status === 'writing' ? <p className="muted">Importing…</p> : null}

      {state.status === 'done' ? <Result summary={state.summary} /> : null}

      {state.status === 'failed' ? (
        <div role="alert" className="notice notice--error">
          <p>The import failed. Nothing was changed beyond what is reported above.</p>
          <p className="muted">{state.message}</p>
        </div>
      ) : null}
    </section>
  );
}

/** The dry run: everything the import would do, and not one write yet. */
function Preview({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: ReadablePlan;
  onConfirm: (plan: ReadablePlan) => void | Promise<void>;
  onCancel: () => void;
}) {
  const total = plan.records.length;

  if (total === 0 && plan.rejected.length === 0) {
    return <p className="muted">That file has no records in it.</p>;
  }

  return (
    <div className="preview">
      <p>
        <strong>{plural(total, 'record')} ready to import</strong> — {plan.creates} new,{' '}
        {plan.overwrites} will replace a record you already have.
      </p>

      {plan.duplicateIds.length > 0 ? (
        <p className="muted">
          {plural(plan.duplicateIds.length, 'record')} appears more than once in this file;
          the last copy of each wins.
        </p>
      ) : null}

      {plan.rejected.length > 0 ? (
        <details open>
          <summary>{plural(plan.rejected.length, 'record')} will be skipped</summary>
          <ul className="rejected">
            {plan.rejected.map((rejection) => (
              <li key={rejection.index}>
                <strong>{rejection.label}</strong>
                <span className="muted"> — {rejection.errors.join('; ')}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="actions">
        <button type="button" onClick={() => void onConfirm(plan)} disabled={total === 0}>
          Import {plural(total, 'record')}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Result({ summary }: { summary: ImportSummary }) {
  return (
    <div className="notice">
      <p>
        Imported {plural(summary.imported, 'record')}
        {summary.skipped > 0 ? `, skipped ${summary.skipped}` : ''}.
      </p>

      {summary.overflowed > 0 ? (
        // "Imported" on its own would leave the user believing it synced.
        <p className="notice notice--warning">
          {plural(summary.overflowed, 'record')} did not fit in synced storage and was saved
          to this device only.
        </p>
      ) : null}

      {summary.errors.length > 0 ? (
        <details>
          <summary>Why records were skipped</summary>
          <ul className="rejected">
            {summary.errors.map((error, index) => (
              <li key={`${index}-${error}`} className="muted">
                {error}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
