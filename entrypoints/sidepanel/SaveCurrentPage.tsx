import { useCallback, useEffect, useState } from 'react';
import type { ProfileDraft } from '../../lib/extractors/profile.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { draftToRecruiter } from '../../lib/recruiters/fromDraft.js';

export interface ActiveTabProbe {
  savable: boolean;
  reason?: string;
  tabId?: number;
}

export interface SaveCurrentPageProps {
  client: RecruiterClient;
  inspect: () => Promise<ActiveTabProbe>;
  requestDraft: (tabId: number) => Promise<ProfileDraft>;
  onSaved: () => void;
}

type State =
  | { status: 'probing' }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; tabId: number }
  | { status: 'saving'; tabId: number }
  | { status: 'saved' }
  | { status: 'failed'; message: string; tabId: number };

/**
 * Saves whoever is in the current tab, in one click.
 *
 * The fallback for when the in-page button cannot mount — a LinkedIn redesign
 * moving the anchor would otherwise kill the feature outright. With this, it
 * costs one extra click. It is also the only thing that justifies `activeTab`.
 */
export function SaveCurrentPage({
  client,
  inspect,
  requestDraft,
  onSaved,
}: SaveCurrentPageProps) {
  const [state, setState] = useState<State>({ status: 'probing' });

  const probe = useCallback(async () => {
    const result = await inspect();
    setState(
      result.savable && typeof result.tabId === 'number'
        ? { status: 'ready', tabId: result.tabId }
        : { status: 'unavailable', reason: result.reason ?? 'Not available on this page.' },
    );
  }, [inspect]);

  useEffect(() => {
    void probe();
  }, [probe]);

  const save = async (tabId: number) => {
    setState({ status: 'saving', tabId });

    try {
      await client.save(draftToRecruiter(await requestDraft(tabId)));
      setState({ status: 'saved' });
      onSaved();
    } catch (error) {
      setState({
        status: 'failed',
        tabId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const tabId =
    state.status === 'ready' || state.status === 'failed' ? state.tabId : undefined;

  return (
    <div className="save-current">
      <button
        type="button"
        disabled={tabId === undefined || state.status === 'saved'}
        onClick={() => tabId !== undefined && void save(tabId)}
      >
        {state.status === 'saving'
          ? 'Saving…'
          : state.status === 'saved'
            ? 'Saved ✓'
            : state.status === 'failed'
              ? 'Try again'
              : 'Save this profile'}
      </button>

      {state.status === 'unavailable' ? (
        // Explained rather than silently greyed out: a disabled control with no
        // reason reads as a bug.
        <p className="muted">{state.reason}</p>
      ) : null}

      {state.status === 'failed' ? (
        <p className="muted" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
