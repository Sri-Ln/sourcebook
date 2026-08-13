import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { inspectActiveTab, requestDraft } from '../../lib/messaging/activeTab.js';
import { recruiterClient } from '../../lib/messaging/client.js';
import type { OutreachStatus, Recruiter } from '../../lib/models/types.js';
import {
  EMPTY_FILTER,
  collectTags,
  filterRecruiters,
  isFiltering,
  type RecruiterFilter,
} from '../../lib/recruiters/filter.js';
import { filterStore } from '../../lib/recruiters/filterStore.js';
import { Filters } from './Filters.js';
import { RecruiterGroups } from './RecruiterGroups.js';
import { SaveCurrentPage } from './SaveCurrentPage.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; recruiters: Recruiter[]; overflowedIds: string[] }
  | { status: 'failed'; message: string };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<RecruiterFilter>(EMPTY_FILTER);

  const load = useCallback(async () => {
    try {
      const { recruiters, overflowedIds } = await recruiterClient.list();
      setState({ status: 'ready', recruiters, overflowedIds });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    void load();
    void filterStore.load().then(setFilter);
  }, [load]);

  // The panel stays open while you browse, so it has to notice saves made from
  // the in-page button. Watching storage is cheaper and more reliable than
  // polling, and it catches changes from another window too.
  useEffect(() => {
    const onChanged = () => void load();
    browser.storage.sync.onChanged.addListener(onChanged);
    return () => browser.storage.sync.onChanged.removeListener(onChanged);
  }, [load]);

  const changeFilter = useCallback((next: RecruiterFilter) => {
    setFilter(next);
    void filterStore.save(next);
  }, []);

  const changeStatus = async (recruiter: Recruiter, outreach: OutreachStatus) => {
    // Optimistic. Waiting on a round trip to redraw a dropdown makes the whole
    // list feel broken.
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            recruiters: current.recruiters.map((r) =>
              r.id === recruiter.id ? { ...r, outreach } : r,
            ),
          }
        : current,
    );

    try {
      await recruiterClient.save({ ...recruiter, outreach, updatedAt: new Date().toISOString() });
    } catch {
      await load();
    }
  };

  const remove = async (id: string) => {
    await recruiterClient.remove(id);
    await load();
  };

  const all = state.status === 'ready' ? state.recruiters : [];
  const tags = useMemo(() => collectTags(all), [all]);

  // Memoised so typing filters in place rather than refetching. At the sync
  // quota's ceiling of roughly two hundred records this is trivially fast, and
  // there is no backend to ask.
  const visible = useMemo(() => filterRecruiters(all, filter), [all, filter]);

  return (
    <div className="panel">
      <header className="panel__header">
        <h1>sourcebook</h1>
        <SaveCurrentPage
          client={recruiterClient}
          inspect={inspectActiveTab}
          requestDraft={requestDraft}
          onSaved={() => void load()}
        />
      </header>

      {state.status === 'loading' ? <p className="muted">Loading…</p> : null}

      {state.status === 'failed' ? (
        <div role="alert" className="error">
          <p>Could not load your saved recruiters.</p>
          <p className="muted">{state.message}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && state.recruiters.length === 0 ? (
        <p className="muted">
          Nothing saved yet. Open a LinkedIn profile and use the Save button, or save the
          profile you are looking at from up there.
        </p>
      ) : null}

      {state.status === 'ready' && state.recruiters.length > 0 ? (
        <>
          <Filters filter={filter} tags={tags} onChange={changeFilter} />

          {visible.length === 0 ? (
            <p className="muted">
              No one matches these filters.{' '}
              <button type="button" className="link" onClick={() => changeFilter(EMPTY_FILTER)}>
                Clear
              </button>
            </p>
          ) : (
            <RecruiterGroups
              recruiters={visible}
              overflowedIds={state.overflowedIds}
              onStatusChange={(recruiter, outreach) => void changeStatus(recruiter, outreach)}
              onRemove={(id) => void remove(id)}
            />
          )}

          {isFiltering(filter) ? (
            <p className="muted count">
              {visible.length} of {state.recruiters.length}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
