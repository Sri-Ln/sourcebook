import { useCallback, useEffect, useState } from 'react';
import type { Recruiter } from '../../lib/models/types.js';
import { sortForDisplay, type RecruiterClient } from '../../lib/messaging/client.js';

const OUTREACH_LABELS: Record<Recruiter['outreach'], string> = {
  'not-contacted': 'Not contacted',
  messaged: 'Messaged',
  replied: 'Replied',
  referred: 'Referred',
  closed: 'Closed',
};

const SOURCE_LABELS: Record<Recruiter['source']['type'], string> = {
  profile: 'From their profile',
  post: 'From a post',
  search: 'From search',
  manual: 'Added by hand',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; recruiters: Recruiter[]; overflowedIds: string[] }
  | { status: 'failed'; message: string };

export function RecruiterList({ client }: { client: RecruiterClient }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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
  }, [load]);

  const remove = async (id: string) => {
    await client.remove(id);
    await load();
  };

  if (state.status === 'loading') {
    return <p className="muted">Loading…</p>;
  }

  if (state.status === 'failed') {
    // Shown rather than swallowed: an empty list and a broken list look
    // identical, and the difference matters a great deal to the user.
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
    <ul className="recruiters">
      {state.recruiters.map((recruiter) => (
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
            <span className={`status status--${recruiter.outreach}`}>
              {OUTREACH_LABELS[recruiter.outreach]}
            </span>
            <span className="muted">{SOURCE_LABELS[recruiter.source.type]}</span>
            {state.overflowedIds.includes(recruiter.id) ? (
              // Saved, but only locally. Silence here would leave the user
              // believing it had reached their other machines.
              <span className="warning" title="Sync storage is full — saved on this device only">
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
  );
}
