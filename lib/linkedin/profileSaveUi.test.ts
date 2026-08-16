import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../../tests/helpers/loadFixture.js';
import { HOST_ATTRIBUTE } from '../ui/shadowMount.js';
import type { RecruiterClient } from '../messaging/client.js';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import {
  HOST_ID,
  MOUNTED_PATH_ATTRIBUTE,
  UNDO_MS,
  findActionAnchor,
  mountProfileSaveUi,
} from './profileSaveUi.js';

function fakeClient(overrides: Partial<RecruiterClient> = {}): RecruiterClient {
  return {
    list: vi.fn().mockResolvedValue({ recruiters: [], overflowedIds: [] }),
    remove: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ overflowed: false }),
    usage: vi.fn().mockResolvedValue({ used: 0, quota: 102_400, fraction: 0 }),
    ...overrides,
  };
}

function saved(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'existing',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function loadProfilePage() {
  document.body.innerHTML = loadFixture('profile-recruiter-1').body.innerHTML;
}

function shadow(): ShadowRoot {
  return document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}="${HOST_ID}"]`)!.shadowRoot!;
}

const button = () => shadow().querySelector<HTMLButtonElement>('button.save')!;

describe('findActionAnchor', () => {
  /** jsdom gives every element a zero rect, so visibility is stubbed per element. */
  function withHeight(el: Element, height: number) {
    el.getBoundingClientRect = () =>
      ({ width: height ? 100 : 0, height, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0,
         toJSON: () => ({}) }) as DOMRect;
  }

  function page(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('returns null when the page has no message link', () => {
    expect(findActionAnchor(page('<main><p>nothing</p></main>'))).toBeNull();
  });

  it('skips a link that renders at zero height', () => {
    const doc = page(`
      <main>
        <a id="hidden" href="/messaging/compose/?x">Message</a>
        <a href="/in/jane"><h2>Jane</h2></a>
        <a id="visible" href="/messaging/compose/?y">Message</a>
      </main>`);
    withHeight(doc.querySelector('#hidden')!, 0);
    withHeight(doc.querySelector('#visible')!, 32);

    // A button in a collapsed container is invisible by construction.
    expect(findActionAnchor(doc)?.id).toBe('visible');
  });

  it('prefers the link that follows the name over one that precedes it', () => {
    const doc = page(`
      <main>
        <a id="sticky" href="/messaging/compose/?x">Message</a>
        <a href="/in/jane"><h2>Jane</h2></a>
        <a id="topcard" href="/messaging/compose/?y">Message</a>
      </main>`);
    for (const el of doc.querySelectorAll('a')) withHeight(el, 32);

    // Taking the first in document order is what put the button in LinkedIn's
    // sticky header, off-screen until scrolled.
    expect(findActionAnchor(doc)?.id).toBe('topcard');
  });

  it('falls back to the first candidate when no name element is found', () => {
    const doc = page('<main><a id="only" href="/messaging/compose/?x">Message</a></main>');
    withHeight(doc.querySelector('#only')!, 32);

    expect(findActionAnchor(doc)?.id).toBe('only');
  });

  it('falls back to all candidates when none report a size', () => {
    // Mid-render, or in a test environment, every rect can be zero. Returning
    // nothing would be worse than returning the best guess.
    const doc = page('<main><a id="a" href="/messaging/compose/?x">Message</a></main>');

    expect(findActionAnchor(doc)?.id).toBe('a');
  });

  it('picks the top card anchor on a real capture', () => {
    const doc = loadFixture('profile-recruiter-1');

    expect(findActionAnchor(doc)).not.toBeNull();
  });
});

describe('mountProfileSaveUi', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('mounts a Save button beside the message action', async () => {
    loadProfilePage();

    await expect(mountProfileSaveUi({ client: fakeClient() })).resolves.toBe('mounted');
    expect(button().textContent).toBe('Save');
  });

  it('gives up silently when the anchor never appears', async () => {
    document.body.innerHTML = '<main><p>A page we do not recognise</p></main>';

    // Silent by design: an extension that complains on every page load gets
    // uninstalled, and a redesign is not something the user can act on.
    await expect(mountProfileSaveUi({ client: fakeClient(), timeoutMs: 20 })).resolves.toBe(
      'no-anchor',
    );
    expect(document.querySelector(`[${HOST_ATTRIBUTE}]`)).toBeNull();
  });

  it('stamps the host with the profile it belongs to', async () => {
    loadProfilePage();

    await mountProfileSaveUi({ client: fakeClient() });

    // Without this a button left over from the previous profile is
    // indistinguishable from a correct one, and would save the wrong person.
    const host = document.querySelector(`[${HOST_ATTRIBUTE}="${HOST_ID}"]`);
    expect(host?.getAttribute(MOUNTED_PATH_ATTRIBUTE)).toBe(document.location.pathname);
  });

  it('does not stack a second host when mounted twice', async () => {
    loadProfilePage();

    await mountProfileSaveUi({ client: fakeClient() });
    await mountProfileSaveUi({ client: fakeClient() });

    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  describe('already-saved state', () => {
    it('recognises a match on member id', async () => {
      loadProfilePage();
      const memberId = 'ACoAAPLACEHOLDER0000000000000000000';
      const client = fakeClient({
        list: vi.fn().mockResolvedValue({
          recruiters: [saved({ memberId, profileUrl: 'https://www.linkedin.com/in/renamed' })],
          overflowedIds: [],
        }),
      });

      await mountProfileSaveUi({ client });

      // Matched on id even though the vanity URL has since changed — which is
      // exactly why the id is the preferred key.
      expect(button().textContent).toBe('Saved ✓');
      // Enabled, because clicking it is how you remove someone.
      expect(button().disabled).toBe(false);
    });

    it('falls back to matching on the profile URL', async () => {
      loadProfilePage();
      const client = fakeClient({
        list: vi.fn().mockResolvedValue({ recruiters: [saved()], overflowedIds: [] }),
      });

      await mountProfileSaveUi({ client });

      expect(button().textContent).toBe('Saved ✓');
    });

    it('still offers Save when the lookup fails', async () => {
      loadProfilePage();
      const client = fakeClient({ list: vi.fn().mockRejectedValue(new Error('worker down')) });

      await mountProfileSaveUi({ client });

      // A failed lookup must never block saving. Showing Save for someone
      // already saved is far better than a button that refuses to appear.
      expect(button().textContent).toBe('Save');
    });
  });

  describe('saving', () => {
    it('saves on a single click, with no form in between', async () => {
      loadProfilePage();
      const client = fakeClient();
      await mountProfileSaveUi({ client });

      button().click();

      // One click is the whole interaction. A confirm step taxes the common
      // case -- where extraction is simply right -- to serve the rare one.
      await vi.waitFor(() => expect(client.save).toHaveBeenCalledTimes(1));
      expect(shadow().querySelector('form')).toBeNull();
    });

    it('saves everything extraction found, including the company', async () => {
      loadProfilePage();
      const client = fakeClient();
      await mountProfileSaveUi({ client });

      button().click();
      await vi.waitFor(() => expect(client.save).toHaveBeenCalled());

      expect(client.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Placeholder',
          profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
          company: 'Postman',
          headline: 'People Team, Operations & Recruiting',
          outreach: 'not-contacted',
          schemaVersion: SCHEMA_VERSION,
        }),
      );
    });

    it('carries the member id so dedupe survives a URL change', async () => {
      loadProfilePage();
      const client = fakeClient();
      await mountProfileSaveUi({ client });

      button().click();
      await vi.waitFor(() => expect(client.save).toHaveBeenCalled());

      expect(client.save).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: expect.stringMatching(/^ACoAA/) }),
      );
    });

    it('flips to saved once the write lands', async () => {
      loadProfilePage();
      await mountProfileSaveUi({ client: fakeClient() });

      button().click();

      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));
      expect(button().disabled).toBe(false);
    });

    it('ignores a second click while the first is still saving', async () => {
      loadProfilePage();
      let release: () => void = () => {};
      const client = fakeClient({
        save: vi.fn().mockImplementation(
          () => new Promise((resolve) => { release = () => resolve({ overflowed: false }); }),
        ),
      });
      await mountProfileSaveUi({ client });

      button().click();
      button().click();

      // Double-saving would create two records for one person.
      expect(client.save).toHaveBeenCalledTimes(1);
      release();
    });

    it('removes the person when the saved button is clicked', async () => {
      loadProfilePage();
      const client = fakeClient({
        list: vi.fn().mockResolvedValue({ recruiters: [saved({ id: 'jane' })], overflowedIds: [] }),
      });
      await mountProfileSaveUi({ client });
      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));

      button().click();

      await vi.waitFor(() => expect(client.remove).toHaveBeenCalledWith('jane'));
      await vi.waitFor(() => expect(button().textContent).toBe('Undo'));
    });

    it('restores the exact record on undo, not a fresh one', async () => {
      loadProfilePage();
      const stored = saved({ id: 'jane', note: 'Posted about backend openings', tags: ['fintech'] });
      const client = fakeClient({
        list: vi.fn().mockResolvedValue({ recruiters: [stored], overflowedIds: [] }),
      });
      await mountProfileSaveUi({ client });
      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));

      button().click();
      await vi.waitFor(() => expect(button().textContent).toBe('Undo'));
      button().click();

      // Rebuilding from the page would silently drop the note and tags, which
      // is exactly what makes removal asymmetrical with saving.
      await vi.waitFor(() => expect(client.save).toHaveBeenCalledWith(stored));
      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));
    });

    it('stops offering undo once the window passes', async () => {
      vi.useFakeTimers();
      try {
        loadProfilePage();
        const client = fakeClient({
          list: vi.fn().mockResolvedValue({ recruiters: [saved({ id: 'jane' })], overflowedIds: [] }),
        });
        await mountProfileSaveUi({ client });
        await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));

        button().click();
        await vi.waitFor(() => expect(button().textContent).toBe('Undo'));

        await vi.advanceTimersByTimeAsync(UNDO_MS + 100);

        expect(button().textContent).toBe('Save');
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a failed removal without pretending it worked', async () => {
      loadProfilePage();
      const client = fakeClient({
        list: vi.fn().mockResolvedValue({ recruiters: [saved({ id: 'jane' })], overflowedIds: [] }),
        remove: vi.fn().mockRejectedValue(new Error('worker down')),
      });
      await mountProfileSaveUi({ client });
      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));

      button().click();

      await vi.waitFor(() => expect(button().textContent).toBe('Remove failed'));
      expect(button().title).toContain('worker down');
    });

    it('reports a failure on the button and stays clickable', async () => {
      loadProfilePage();
      const client = fakeClient({ save: vi.fn().mockRejectedValue(new Error('sync is full')) });
      await mountProfileSaveUi({ client });

      button().click();

      await vi.waitFor(() => expect(button().textContent).toBe('Save failed'));
      // No panel to put a message in, and a toast on someone else's page is an
      // intrusion -- so the button carries it, and the retry stays available.
      expect(button().title).toContain('sync is full');
      expect(button().disabled).toBe(false);
    });
  });
});
