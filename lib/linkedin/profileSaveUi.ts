import { extractProfile, type ProfileDraft } from '../extractors/profile.js';
import type { RecruiterClient } from '../messaging/client.js';
import type { Recruiter } from '../models/types.js';
import { draftToRecruiter } from '../recruiters/fromDraft.js';
import { mountShadowHost } from '../ui/shadowMount.js';
import { waitForElement } from '../ui/waitForElement.js';

/**
 * The Message link. Chosen because it is semantic — an href to a real endpoint
 * — rather than a class name. LinkedIn's classes are build hashes that change
 * on every deploy; this href has to keep working for their own product.
 */
export const ANCHOR_SELECTOR = 'a[href*="/messaging/compose"]';

/** Where to put the button, and how to attach it there. */
export interface MountTarget {
  anchor: Element;
  position: InsertPosition;
}

/** The person's own name: the one element a profile page cannot omit. */
function findNameLink(doc: Document): Element | null {
  return (
    [...doc.querySelectorAll('h2')].find((h) => h.closest('a[href*="/in/"]'))?.closest(
      'a[href*="/in/"]',
    ) ?? null
  );
}

function isRendered(el: Element): boolean {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/**
 * Chooses which of the page's Message links to sit beside.
 *
 * A profile carries five. Taking the first in document order put the button in
 * LinkedIn's sticky header, which is off-screen until you scroll.
 *
 * Prefer one that actually renders, then the one following the name: the top
 * card's action row comes after the name, the sticky header's copy does not.
 */
export function findActionAnchor(doc: Document): Element | null {
  const candidates = [...doc.querySelectorAll(ANCHOR_SELECTOR)];
  if (candidates.length === 0) return null;

  const rendered = candidates.filter(isRendered);
  // jsdom reports every rect as zero, and so can a real page mid-render.
  // Falling back to all candidates beats returning nothing.
  const usable = rendered.length > 0 ? rendered : candidates;

  const nameLink = findNameLink(doc);
  if (!nameLink) return usable[0] ?? null;

  const after = usable.filter(
    (el) => nameLink.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

  return after[0] ?? usable[0] ?? null;
}

/** How far to walk up from the name looking for the action area. */
const ANCESTOR_LIMIT = 10;

/**
 * Decides where the Save button goes.
 *
 * The Message link is the nicest place to sit, and it is **not always there**.
 * LinkedIn omits it when you cannot message someone: no connection, restricted
 * privacy, no InMail. Anchoring only to it means no button at all on those
 * profiles.
 *
 * So the name is the floor. It is the one element a profile must have, and it
 * is matched structurally rather than by text, which matters because LinkedIn
 * is localised and "Connect" is not "Connect" for everyone.
 *
 * In order:
 *
 * 1. Beside the Message link, in the action row.
 * 2. Inside the nearest ancestor of the name that holds buttons, which is the
 *    top card's action area.
 * 3. Immediately after the name itself, which cannot fail.
 */
export function findMountTarget(doc: Document): MountTarget | null {
  const messageLink = findActionAnchor(doc);
  if (messageLink) {
    return { anchor: messageLink.parentElement ?? messageLink, position: 'afterend' };
  }

  const nameLink = findNameLink(doc);
  if (!nameLink) return null;

  let ancestor = nameLink.parentElement;
  for (let depth = 0; ancestor && depth < ANCESTOR_LIMIT; depth += 1) {
    if (ancestor.querySelector('button')) {
      return { anchor: ancestor, position: 'beforeend' };
    }
    ancestor = ancestor.parentElement;
  }

  // Nothing button-shaped anywhere above the name. Sitting directly after it is
  // not elegant, but it is visible, and visible beats absent.
  return { anchor: nameLink.parentElement ?? nameLink, position: 'afterend' };
}

export const HOST_ID = 'save-recruiter';

/**
 * How long Undo stays available after a removal.
 *
 * Saving costs nothing to repeat: it is rebuilt from the page. Removing is not
 * symmetrical — it destroys the note, tags, status and follow-up date added
 * afterwards, none of which the page can reconstruct. Undo is what makes a
 * one-click removal fair.
 */
export const UNDO_MS = 8000;

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
  /* display is set explicitly: all:initial resets it, and relying on the
     parent's layout to give an inline box sensible metrics is a gamble. */
  :host { all: initial; display: inline-flex; align-items: center; vertical-align: middle;
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  /* Sized and weighted to sit among LinkedIn's own pill buttons rather than
     look like a stray link. A transparent 13px outline was easy to miss
     entirely, which is half of why this bug went unseen. */
  .save { font: inherit; font-size: 14px; font-weight: 600; line-height: 1;
          padding: 8px 16px; border-radius: 999px; border: 1px solid #1c273c;
          background: #1c273c; color: #fff; cursor: pointer; white-space: nowrap; }
  .save:hover { background: #2b3a56; border-color: #2b3a56; }
  .save[disabled] { cursor: default; background: transparent; color: #1c273c; opacity: .8; }
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
  // Waits for the name, not the Message link. The name is always present; the
  // Message link is not, and waiting on it meant timing out to nothing on any
  // profile you cannot message.
  const appeared = await waitForElement('a[href*="/in/"] h2', {
    root: doc,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(signal ? { signal } : {}),
  });
  if (!appeared || signal?.aborted) return 'no-anchor';

  const target = findMountTarget(doc);
  if (!target) return 'no-anchor';

  const draft = extract(doc);
  const root = mountShadowHost({
    anchor: target.anchor,
    id: HOST_ID,
    position: target.position,
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
  let saved: Recruiter | undefined;
  try {
    const { recruiters } = await client.list();
    saved = recruiters.find(
      (r) =>
        (draft.memberId !== undefined && r.memberId === draft.memberId) ||
        (!!draft.profileUrl && normalise(r.profileUrl) === normalise(draft.profileUrl)),
    );
  } catch {
    // A failed lookup must not block saving. Worst case the user sees "Save"
    // for someone already saved, and the store overwrites -- far better than a
    // button that refuses to appear.
  }

  let removed: Recruiter | undefined;
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const render = () => {
    button.disabled = false;

    if (saved) {
      button.textContent = 'Saved ✓';
      button.title = 'Remove from sourcebook';
    } else if (removed) {
      button.textContent = 'Undo';
      button.title = `Restore ${removed.name}`;
    } else {
      button.textContent = 'Save';
      button.title = '';
    }
  };
  render();

  const forgetUndo = () => {
    if (undoTimer !== undefined) clearTimeout(undoTimer);
    undoTimer = undefined;
  };

  button.addEventListener('click', async () => {
    if (busy) return;

    busy = true;
    button.disabled = true;
    const previous = button.textContent;

    try {
      if (saved) {
        button.textContent = 'Removing…';
        await client.remove(saved.id);
        // Kept in memory so Undo restores the record exactly -- same id, same
        // note, same tags -- rather than a fresh one built from the page.
        removed = saved;
        saved = undefined;
        forgetUndo();
        undoTimer = setTimeout(() => {
          removed = undefined;
          render();
        }, UNDO_MS);
      } else if (removed) {
        button.textContent = 'Restoring…';
        await client.save(removed);
        saved = removed;
        removed = undefined;
        forgetUndo();
      } else {
        button.textContent = 'Saving…';
        const record = draftToRecruiter(draft);
        await client.save(record);
        saved = record;
      }
    } catch (error) {
      // Reported on the button itself. There is no panel to hold a message, and
      // a toast on someone else's page is an intrusion.
      button.textContent = previous === 'Saved ✓' ? 'Remove failed' : 'Save failed';
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

