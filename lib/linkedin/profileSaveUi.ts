import { extractProfile, type ProfileDraft } from '../extractors/profile.js';
import type { RecruiterClient } from '../messaging/client.js';
import { draftToRecruiter } from '../recruiters/fromDraft.js';
import { mountShadowHost } from '../ui/shadowMount.js';
import { waitForElement } from '../ui/waitForElement.js';

/**
 * The Message link. Chosen because it is semantic — an href to a real endpoint
 * — rather than a class name. LinkedIn's classes are build hashes that change
 * on every deploy; this href has to keep working for their own product.
 */
export const ANCHOR_SELECTOR = 'a[href*="/messaging/compose"]';

export const HOST_ID = 'save-recruiter';

/** Records which profile the mounted button belongs to, so staleness is visible. */
export const MOUNTED_PATH_ATTRIBUTE = 'data-sourcebook-path';

export type MountOutcome = 'mounted' | 'no-anchor';

export interface MountOptions {
  client: RecruiterClient;
  doc?: Document;
  timeoutMs?: number;
  extract?: (doc: Document) => ProfileDraft;
  /**
   * Abandons the mount. Soft navigation uses this: without it, a wait started
   * on one profile can resolve after you have moved to the next and render the
   * previous person's details — a button that saves the wrong human.
   */
  signal?: AbortSignal;
}

const STYLES = `
  :host { all: initial; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .save { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px;
          border: 1px solid currentColor; background: transparent; cursor: pointer; }
  .save[disabled] { cursor: default; opacity: .75; }
  .panel { position: absolute; z-index: 9999; margin-top: 6px; width: 280px; padding: 12px;
           border: 1px solid rgba(0,0,0,.15); border-radius: 8px; background: Canvas;
           color: CanvasText; box-shadow: 0 8px 24px rgba(0,0,0,.18);
           display: flex; flex-direction: column; gap: 8px; }
  .field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
  .field input, .field select, .panel textarea {
    font: inherit; font-size: 12px; padding: 4px 6px;
    border: 1px solid rgba(0,0,0,.25); border-radius: 4px; background: Canvas; color: CanvasText; }
  .panel__actions { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .counter { margin-right: auto; font-size: 11px; opacity: .6; }
  .counter--full { opacity: 1; font-weight: 600; }
  .error { margin: 0; font-size: 11px; }
`;

function styleTag(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = STYLES;
  return style;
}

function normalise(url: string | undefined): string {
  return (url ?? '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Mounts the Save button beside LinkedIn's own action buttons.
 *
 * Returns `'no-anchor'` and does nothing visible when the page is not what we
 * expect. Silence is deliberate: an extension that complains on every page load
 * gets uninstalled, and a missing anchor is an ordinary consequence of a
 * redesign rather than something the user can act on.
 */
export async function mountProfileSaveUi({
  client,
  doc = document,
  timeoutMs,
  extract = extractProfile,
  signal,
}: MountOptions): Promise<MountOutcome> {
  const anchor = await waitForElement(ANCHOR_SELECTOR, {
    root: doc,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(signal ? { signal } : {}),
  });
  if (!anchor || signal?.aborted) return 'no-anchor';

  const draft = extract(doc);
  const root = mountShadowHost({
    anchor: anchor.parentElement ?? anchor,
    id: HOST_ID,
    position: 'afterend',
  });

  // Stamped so the content script can tell a button for *this* profile from one
  // left over from the last. Without it a stale button is indistinguishable
  // from a correct one, and it would happily save the wrong person.
  (root.host as HTMLElement).setAttribute(MOUNTED_PATH_ATTRIBUTE, doc.location.pathname);

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'save';

  root.replaceChildren(styleTag(), button);

  // Matched on memberId first: vanity URLs are user-changeable, so two links to
  // the same person can differ while the id stays put.
  let saved = false;
  try {
    const { recruiters } = await client.list();
    saved = recruiters.some(
      (r) =>
        (draft.memberId && r.memberId === draft.memberId) ||
        (!!draft.profileUrl && normalise(r.profileUrl) === normalise(draft.profileUrl)),
    );
  } catch {
    // A failed lookup must not block saving. Worst case the user sees "Save"
    // for someone already saved, and the store rejects or overwrites — far
    // better than a button that refuses to appear.
  }

  const render = () => {
    button.textContent = saved ? 'Saved ✓' : 'Save';
    button.disabled = saved;
  };
  render();

  let busy = false;

  button.addEventListener('click', async () => {
    if (saved || busy) return;

    busy = true;
    button.textContent = 'Saving…';
    button.disabled = true;

    try {
      await client.save(draftToRecruiter(draft));
      saved = true;
    } catch (error) {
      // Reported on the button itself. There is no panel to put a message in,
      // and a page-level toast on someone else's site is an intrusion.
      button.textContent = 'Save failed';
      button.title = error instanceof Error ? error.message : String(error);
      button.disabled = false;
      busy = false;
      return;
    }

    busy = false;
    render();
  });

  return 'mounted';
}

