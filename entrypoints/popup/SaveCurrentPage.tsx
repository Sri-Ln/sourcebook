import { useEffect, useRef, useState } from 'react';
import type { ProfileDraft } from '../../lib/extractors/profile.js';
import type { RecruiterClient } from '../../lib/messaging/client.js';
import { SCHEMA_VERSION } from '../../lib/models/types.js';
import { createSavePanel, type SavePanelValues } from '../../lib/ui/savePanel.js';

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
  | { status: 'editing'; draft: ProfileDraft }
  | { status: 'failed'; message: string; tabId: number };

/**
 * The fallback that makes depending on an injected button safe.
 *
 * If LinkedIn moves the anchor the in-page button never mounts — and without
 * this the feature is simply dead. With it, the failure costs one extra click.
 * This is also the only thing that justifies `activeTab` in the manifest.
 */
export function SaveCurrentPage({
  client,
  inspect,
  requestDraft,
  onSaved,
}: SaveCurrentPageProps) {
  const [state, setState] = useState<State>({ status: 'probing' });
  const panelHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void inspect().then((probe) => {
      if (cancelled) return;
      setState(
        probe.savable && typeof probe.tabId === 'number'
          ? { status: 'ready', tabId: probe.tabId }
          : { status: 'unavailable', reason: probe.reason ?? 'Not available on this page.' },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [inspect]);

  // The panel is plain DOM, shared with the in-page button. Reusing it beats a
  // second React form that would drift out of step with the first.
  useEffect(() => {
    if (state.status !== 'editing' || !panelHost.current) return;

    const host = panelHost.current;
    const panel = createSavePanel({
      draft: state.draft,
      onCancel: () => setState({ status: 'probing' }),
      onSubmit: async (values: SavePanelValues) => {
        try {
          await client.save(toRecruiter(state.draft, values));
          onSaved();
          setState({ status: 'probing' });
        } catch (error) {
          const message = panel.querySelector<HTMLElement>('.error');
          if (message) {
            message.textContent = error instanceof Error ? error.message : String(error);
            message.hidden = false;
          }
        }
      },
    });

    host.replaceChildren(panel);
    return () => host.replaceChildren();
  }, [state, client, onSaved]);

  // Re-probe after cancel or save.
  useEffect(() => {
    if (state.status !== 'probing') return;
    let cancelled = false;

    void inspect().then((probe) => {
      if (cancelled) return;
      setState(
        probe.savable && typeof probe.tabId === 'number'
          ? { status: 'ready', tabId: probe.tabId }
          : { status: 'unavailable', reason: probe.reason ?? 'Not available on this page.' },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [state.status, inspect]);

  const open = async (tabId: number) => {
    try {
      setState({ status: 'editing', draft: await requestDraft(tabId) });
    } catch (error) {
      setState({
        status: 'failed',
        tabId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (state.status === 'editing') {
    return <div className="save-current" ref={panelHost} />;
  }

  const disabled = state.status !== 'ready' && state.status !== 'failed';

  return (
    <div className="save-current">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (state.status === 'ready') void open(state.tabId);
          if (state.status === 'failed') void open(state.tabId);
        }}
      >
        Save current page
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

function toRecruiter(draft: ProfileDraft, values: SavePanelValues) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    name: values.name,
    profileUrl: draft.profileUrl ?? '',
    ...(draft.memberId ? { memberId: draft.memberId } : {}),
    ...(values.headline ? { headline: values.headline } : {}),
    ...(values.company ? { company: values.company } : {}),
    outreach: 'not-contacted' as const,
    source: {
      type: values.sourceType,
      ...(values.sourceUrl ? { url: values.sourceUrl } : {}),
    },
    tags: values.tags,
    ...(values.note ? { note: values.note } : {}),
    savedAt: now,
    updatedAt: now,
  };
}
