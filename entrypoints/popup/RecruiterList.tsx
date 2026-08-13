import { useCallback, useEffect, useMemo, useState } from 'react';
import { OUTREACH_STATUSES, type OutreachStatus, type Recruiter } from '../../lib/models/types.js';
import { sortForDisplay, type RecruiterClient } from '../../lib/messaging/client.js';
import {
  EMPTY_FILTER,
  collectTags,
  filterRecruiters,
  isFiltering,
  type RecruiterFilter,
} from '../../lib/recruiters/filter.js';
import { Filters, OUTREACH_LABELS } from './Filters.js';

const SOURCE_LABELS: Record<Recruiter['source']['type'], string> = {
  profile: 'From their profile',
  post: 'From a post',
  search: 'From search',
  manual: 'Added by hand',
};

export interface FilterStore {
  load(): Promise<RecruiterFilter>;
  save(filter: RecruiterFilter): Promise<void>;
}

/** Filter state outlives the popup, which closes the moment focus leaves it. */
const memoryFilterStore: FilterStore = {
  async load() {
    return EMPTY_FILTER;
  },
  async save() {},
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; recruiters: Recruiter[]; overflowedIds: string[] }
  | { status: 'failed'; message: string };

export interface RecruiterListProps {
  client: RecruiterClient;
  filterStore?: FilterStore;
}

export function RecruiterList({ client, filterStore = memoryFilterStore }: RecruiterListProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<RecruiterFilter>(EMPTY_FILTER);

  const load = useCallback(async () => {
    try {
      const { recruiters, overflowedIds } = await client.list();
      setState({ status: 'ready', recruiters: sortForDisplay(recruiters), overflowedIds });
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [client]);

  useEffect(() => {
    void load();
    void filterStore.load().then(setFilter);
  }, [load, filterStore]);

  const changeFilter = useCallback(
    (next: RecruiterFilter) => {
      setFilter(next);
      void filterStore.save(next);
    },
    [filterStore],
  );

  const remove = async (id: string) => {
    await client.remove(id);
    await load();
  };

  const changeStatus = async (recruiter: Recruiter, outreach: OutreachStatus) => {
    // Optimistic: the row updates immediately and the write goes through the
    // background worker's queue. Waiting on a round trip to redraw a dropdown
    // makes the whole list feel broken.
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
      await client.save({ ...recruiter, outreach, updatedAt: new Date().toISOString() });
    } catch {
      // Put back what storage actually holds rather than leaving the row
      // showing a change that never landed.
      await load();
    }
  };

  const allRecruiters = state.status === 'ready' ? state.recruiters : [];
  const tags = useMemo(() => collectTags(allRecruiters), [allRecruiters]);
  const visible = useMemo(
    () => filterRecruiters(allRecruiters, filter),
    [allRecruiters, filter],
  );

  if (state.status === 'loading') return <p className="muted">Loading…</p>;

  if (state.status === 'failed') {
    return (
      <div role="alert" className="error">
        <p>Could not load your saved recruiters.</p>
        <p className="muted">{state.message}</p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  if (state.recruiters.length === 0) {
    return (
      <p className="muted">
        Nothing saved yet. Open a LinkedIn profile and use the Save button to add your
        first recruiter.
      </p>
    );
  }

  return (
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
        <ul className="recruiters">
          {visible.map((recruiter) => (
            <li key={recruiter.id} className="recruiter">
              <div className="recruiter__main">
                <a
                  className="recruiter__name"
                  href={recruiter.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {recruiter.name}
                </a>
                {recruiter.headline ? (
                  <p className="recruiter__headline">{recruiter.headline}</p>
                ) : null}
                {recruiter.company ? (
                  <p className="recruiter__company">{recruiter.company}</p>
                ) : null}
              </div>

              <div className="recruiter__meta">
                <select
                  className={`status status--${recruiter.outreach}`}
                  aria-label={`Outreach status for ${recruiter.name}`}
                  value={recruiter.outreach}
                  onChange={(event) =>
                    void changeStatus(recruiter, event.target.value as OutreachStatus)
                  }
                >
                  {OUTREACH_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {OUTREACH_LABELS[status]}
                    </option>
                  ))}
                </select>

                <span className="muted">{SOURCE_LABELS[recruiter.source.type]}</span>

                {state.overflowedIds.includes(recruiter.id) ? (
                  <span
                    className="warning"
                    title="Sync storage is full — saved on this device only"
                  >
                    Not synced
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                className="recruiter__remove"
                aria-label={`Remove ${recruiter.name}`}
                onClick={() => void remove(recruiter.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {isFiltering(filter) ? (
        <p className="muted filters__count">
          {visible.length} of {state.recruiters.length}
        </p>
      ) : null}
    </>
  );
}
