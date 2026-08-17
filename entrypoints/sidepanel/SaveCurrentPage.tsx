import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ProfileDraft } from '../../lib/extractors/profile.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { findSaved } from '../../lib/recruiters/findSaved.js';
import { draftToRecruiter } from '../../lib/recruiters/fromDraft.js';
import { watchRecruiters } from '../../lib/storage/watchRecruiters.js';

export interface ActiveTabProbe {
  savable: boolean;
  reason?: string;
  tabId?: number;
  /** Used to recognise a profile already in the store. Absent on older probes. */
  url?: string;
}

export interface SaveCurrentPageProps {
  client: RecruiterClient;
  inspect: () => Promise<ActiveTabProbe>;
  requestDraft: (tabId: number) => Promise<ProfileDraft>;
  onSaved: () => void;
  /**
   * Subscribes to tab changes, returning an unsubscribe. Injected so the
   * behaviour can be tested without a browser.
   */
  onTabChanged?: (listener: () => void) => () => void;
  /** Subscribes to changes in the saved set. Injected for the same reason. */
  onRecruitersChanged?: (listener: () => void) => () => void;
}

/**
 * `saved` is derived from the store rather than remembered from a click.
 *
 * It used to be a terminal `'saved'` status, reachable only by pressing this
 * button — which meant it was wrong in both directions. It never appeared for
 * someone saved from the in-page button, and it stayed on, disabled, after that
 * person was deleted from the list below it.
 */
type State =
  | { status: 'probing' }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; tabId: number; saved: boolean }
  | { status: 'saving'; tabId: number }
  | { status: 'failed'; message: string; tabId: number };

/**
 * Saves whoever is in the current tab, in one click.
 *
 * The fallback for when the in-page button cannot mount — a LinkedIn redesign
 * moving the anchor would otherwise kill the feature outright. With this, it
 * costs one extra click. It is also the only thing that justifies `activeTab`.
 */
/**
 * Re-probes whenever the user switches tab or navigates.
 *
 * The panel stays open across navigations, so a single probe on mount is not
 * enough: after one save the button would read "Saved ✓" forever, including on
 * the next profile, which is both wrong and blocks saving that person.
 */
function subscribeToTabChanges(listener: () => void): () => void {
  const onActivated = () => listener();
  const onUpdated = (_id: number, change: { url?: string; status?: string }) => {
    // Only when the address actually changed or the page finished loading;
    // onUpdated also fires for favicons and title changes.
    if (change.url || change.status === 'complete') listener();
  };

  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);

  return () => {
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onUpdated.removeListener(onUpdated);
  };
}

export function SaveCurrentPage({
  client,
  inspect,
  requestDraft,
  onSaved,
  onTabChanged = subscribeToTabChanges,
  onRecruitersChanged = watchRecruiters,
}: SaveCurrentPageProps) {
  const [state, setState] = useState<State>({ status: 'probing' });

  // A ref rather than state: this guards against a redraw, so reading it must
  // not schedule one. Mirrors the `busy` flag the in-page button keeps.
  const saving = useRef(false);

  const probe = useCallback(async () => {
    const result = await inspect();

    if (!result.savable || typeof result.tabId !== 'number') {
      setState({ status: 'unavailable', reason: result.reason ?? 'Not available on this page.' });
      return;
    }

    let saved = false;
    try {
      const { recruiters } = await client.list();
      saved = findSaved(recruiters, { profileUrl: result.url }) !== undefined;
    } catch {
      // Offering a save we cannot confirm is better than a button stuck on
      // "probing" — saving again simply overwrites.
    }

    // A click that started while this was in flight has the newer answer.
    if (saving.current) return;

    setState({ status: 'ready', tabId: result.tabId, saved });
  }, [client, inspect]);

  useEffect(() => {
    void probe();
  }, [probe]);

  // Without this the button keeps whatever state it reached — most visibly
  // "Saved ✓" — for every profile you visit afterwards.
  useEffect(() => onTabChanged(() => void probe()), [onTabChanged, probe]);

  // And without this it keeps that state through every save and delete made
  // from the page or from the list below, until the tab happens to change.
  useEffect(() => onRecruitersChanged(() => void probe()), [onRecruitersChanged, probe]);

  const save = async (tabId: number) => {
    saving.current = true;
    setState({ status: 'saving', tabId });

    try {
      await client.save(draftToRecruiter(await requestDraft(tabId)));
      setState({ status: 'ready', tabId, saved: true });
      onSaved();
    } catch (error) {
      setState({
        status: 'failed',
        tabId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      saving.current = false;
    }
  };

  const tabId =
    state.status === 'ready' || state.status === 'failed' ? state.tabId : undefined;
  const isSaved = state.status === 'ready' && state.saved;

  return (
    <div className="save-current">
      <button
        type="button"
        disabled={tabId === undefined || isSaved}
        onClick={() => tabId !== undefined && void save(tabId)}
      >
        {state.status === 'saving'
          ? 'Saving…'
          : isSaved
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
