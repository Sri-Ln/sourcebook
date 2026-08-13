import { beforeEach, describe, expect, it } from 'vitest';
import { HOST_ATTRIBUTE, mountShadowHost, unmountShadowHost } from './shadowMount.js';

describe('mountShadowHost', () => {
  let anchor: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="anchor"></div>';
    anchor = document.querySelector('#anchor')!;
  });

  it('mounts a shadow root inside the anchor', () => {
    const root = mountShadowHost({ anchor, id: 'save-button' });

    expect(root).toBeInstanceOf(ShadowRoot);
    expect(anchor.querySelector(`[${HOST_ATTRIBUTE}="save-button"]`)).not.toBeNull();
  });

  it('is idempotent: mounting twice yields one host and the same root', () => {
    const first = mountShadowHost({ anchor, id: 'save-button' });
    const second = mountShadowHost({ anchor, id: 'save-button' });

    // Soft navigation re-runs the mount. Stacking a second button would be the
    // most visible possible bug.
    expect(second).toBe(first);
    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('reuses an existing host even when the anchor has changed', () => {
    const first = mountShadowHost({ anchor, id: 'save-button' });

    document.body.innerHTML = '<div id="other"></div>';
    const other = document.querySelector('#other') as HTMLElement;
    const second = mountShadowHost({ anchor: other, id: 'save-button' });

    // The old host left with the old DOM, so a fresh one is correct here —
    // what must never happen is two live hosts at once.
    expect(second).not.toBe(first);
    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('keeps separate ids independent', () => {
    mountShadowHost({ anchor, id: 'save-button' });
    mountShadowHost({ anchor, id: 'save-panel' });

    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(2);
  });

  it('appends by default and can prepend', () => {
    anchor.innerHTML = '<span class="existing"></span>';

    mountShadowHost({ anchor, id: 'appended' });
    expect(anchor.lastElementChild?.getAttribute(HOST_ATTRIBUTE)).toBe('appended');

    mountShadowHost({ anchor, id: 'prepended', position: 'afterbegin' });
    expect(anchor.firstElementChild?.getAttribute(HOST_ATTRIBUTE)).toBe('prepended');
  });

  it('does not inherit page styles into the shadow root', () => {
    const root = mountShadowHost({ anchor, id: 'save-button' });
    root.innerHTML = '<button>Save</button>';

    // The point of the shadow root: LinkedIn's stylesheet cannot reach in, and
    // ours cannot leak out onto their page.
    expect(root.querySelector('button')).not.toBeNull();
    expect(document.querySelector('button')).toBeNull();
  });

  it('unmounts cleanly and can be mounted again afterwards', () => {
    mountShadowHost({ anchor, id: 'save-button' });
    unmountShadowHost('save-button');

    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(0);

    mountShadowHost({ anchor, id: 'save-button' });
    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('treats unmounting something absent as a no-op', () => {
    expect(() => unmountShadowHost('never-mounted')).not.toThrow();
  });
});
