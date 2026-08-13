/** Identifies our hosts so mounting can be idempotent and cleanup can find them. */
export const HOST_ATTRIBUTE = 'data-sourcebook-ui';

export interface MountOptions {
  anchor: Element;
  /** Stable name for this piece of UI, e.g. `save-button`. */
  id: string;
  position?: InsertPosition;
}

function findHost(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}="${CSS.escape(id)}"]`);
}

/**
 * Mounts a Shadow DOM host and returns its root.
 *
 * **Idempotent.** Soft navigation re-runs the mount, and stacking a second
 * button on every click would be the most visible possible bug. If a live host
 * with this id already exists, its root is returned untouched.
 *
 * A shadow root rather than a plain element because this UI lives inside
 * LinkedIn's own document: their stylesheet cannot reach in, and ours cannot
 * leak out onto their page.
 */
export function mountShadowHost({ anchor, id, position = 'beforeend' }: MountOptions): ShadowRoot {
  const existing = findHost(id);

  // `isConnected` matters: LinkedIn re-renders whole subtrees, and a host it
  // discarded is still a live object we must not hand back.
  if (existing?.isConnected && existing.shadowRoot) return existing.shadowRoot;

  // A detached leftover would otherwise accumulate one host per navigation.
  existing?.remove();

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, id);

  anchor.insertAdjacentElement(position, host);

  // `open` rather than `closed`: WXT's content-script UI helpers expect it, and
  // recovering an existing root after a re-mount depends on being able to read
  // `host.shadowRoot` back.
  return host.attachShadow({ mode: 'open' });
}

/** Removes the host if present. Absent is not an error. */
export function unmountShadowHost(id: string): void {
  findHost(id)?.remove();
}
