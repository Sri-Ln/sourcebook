import { useCallback, useEffect, useMemo, useState } from 'react';
import { inspectActiveTab, requestDraft } from '../../lib/messaging/activeTab.js';
import { recruiterClient } from '../../lib/messaging/client.js';
import type { OutreachStatus, Recruiter } from '../../lib/models/types.js';
import {
  EMPTY_FILTER,
  filterRecruiters,
  isFiltering,
  type RecruiterFilter,
} from '../../lib/recruiters/filter.js';
import { filterStore } from '../../lib/recruiters/filterStore.js';
import { filterChipTags, rankTags } from '../../lib/recruiters/tagSuggestions.js';
import { isScheduled } from '../../lib/recruiters/followUp.js';
import { watchRecruiters } from '../../lib/storage/watchRecruiters.js';
import { hasReminderPermission, requestReminderPermission } from '../../lib/messaging/notifications.js';
import { Filters } from './Filters.js';
import { RecruiterGroups } from './RecruiterGroups.js';
import { ReminderOptIn } from './ReminderOptIn.js';
import { SaveCurrentPage } from './SaveCurrentPage.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; recruiters: Recruiter[]; overflowedIds: string[] }
  | { status: 'failed'; message: string };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<RecruiterFilter>(EMPTY_FILTER);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

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
  useEffect(() => watchRecruiters(() => void load()), [load]);

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
    if (editingId === id) setEditingId(undefined);
    await load();
  };

  // Throws on failure rather than swallowing, so the form can show the reason
  // and keep what was typed.
  const saveEdit = useCallback(async (updated: Recruiter) => {
    await recruiterClient.save(updated);
    setEditingId(undefined);
    await load();
  }, [load]);

  const all = state.status === 'ready' ? state.recruiters : [];

  // Ranked over every record rather than the filtered view: the tags worth
  // suggesting are the ones you use, not the ones matching the current filter.
  const rankedTags = useMemo(() => rankTags(all), [all]);

  // Only the few most-used get a chip. The row used to grow with the
  // collection, which turned a filter bar into a tag inventory; the search box
  // already reaches anything rarer. Active filters are always kept, or one
  // would be impossible to switch off.
  const chipTags = useMemo(
    () => filterChipTags({ ranked: rankedTags, selected: filter.tags }),
    [rankedTags, filter.tags],
  );

  // Memoised so typing filters in place rather than refetching. At the sync
  // quota's ceiling of roughly two hundred records this is trivially fast, and
  // there is no backend to ask.
  const visible = useMemo(() => filterRecruiters(all, filter), [all, filter]);

  return (
    <div className="app">
      {/* No title here: the browser already labels the panel, and a heading
          above a single button was two lines of chrome for no information. */}
      <header className="app__header">
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
          <Filters filter={filter} tags={chipTags} onChange={changeFilter} />

          <ReminderOptIn
            hasScheduled={all.some(isScheduled)}
            check={hasReminderPermission}
            request={requestReminderPermission}
          />

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
              tagSuggestions={rankedTags}
              editingId={editingId}
              onStatusChange={(recruiter, outreach) => void changeStatus(recruiter, outreach)}
              onRemove={(id) => void remove(id)}
              onEdit={setEditingId}
              onSaveEdit={saveEdit}
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
