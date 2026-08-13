import { useCallback, useEffect, useState } from 'react';
import { recruiterClient, type DataClient, type RecruiterClient } from '../../lib/messaging/client.js';
import type { Recruiter } from '../../lib/models/types.js';
import type { StorageUsage } from '../../lib/storage/SyncProvider.js';
import { ImportExport } from './ImportExport.js';
import { QuotaMeter } from './QuotaMeter.js';
import { TagManager } from './TagManager.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; recruiters: Recruiter[]; usage: StorageUsage | undefined }
  | { status: 'failed'; message: string };

export default function App({
  client = recruiterClient,
}: {
  client?: RecruiterClient & DataClient;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const { recruiters } = await client.list();

      // Deliberately best-effort and separate from the list. `getBytesInUse` is
      // the most fragile call on this page, and losing the meter must not take
      // the export button — the user's escape hatch — down with it.
      const usage = await client.usage().catch(() => undefined);

      setState({ status: 'ready', recruiters, usage });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="options">
      <header>
        <h1>sourcebook</h1>
        <Privacy />
      </header>

      {state.status === 'loading' ? <p className="muted">Loading…</p> : null}

      {state.status === 'failed' ? (
        <div role="alert" className="notice notice--error">
          <p>Could not read your saved recruiters.</p>
          <p className="muted">{state.message}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          {state.usage ? (
            <QuotaMeter usage={state.usage} />
          ) : (
            <section className="panel">
              <h2>Storage</h2>
              <p className="muted">
                The storage reading is unavailable, so the quota meter cannot be shown.
                Everything else on this page still works.
              </p>
            </section>
          )}

          <ImportExport
            client={client}
            recruiters={state.recruiters}
            onChanged={() => void load()}
          />

          <TagManager
            client={client}
            recruiters={state.recruiters}
            onChanged={() => void load()}
          />
        </>
      ) : null}
    </main>
  );
}

/**
 * The privacy claim, stated exactly rather than generously.
 *
 * "Nothing ever leaves this device" would be a lie the moment browser sync is
 * switched on — records live in `chrome.storage.sync`. A privacy claim that is
 * not precisely true is worse than none at all, so the exception is named.
 */
function Privacy() {
  return (
    <div className="privacy">
      <p>
        <strong>Your data stays on your machine.</strong> sourcebook has no server, no
        account, and no telemetry. It makes no network requests of its own, and nothing you
        save is sent to us or to anyone else.
      </p>
      <p className="muted">
        One exception worth naming: records are kept in your browser&rsquo;s sync storage.
        If you have browser sync switched on, your browser replicates them to your own
        account the same way it does your bookmarks. Turn browser sync off and they stay on
        this device.
      </p>
    </div>
  );
}
