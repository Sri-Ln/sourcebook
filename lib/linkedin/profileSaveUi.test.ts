import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../../tests/helpers/loadFixture.js';
import { HOST_ATTRIBUTE } from '../ui/shadowMount.js';
import type { RecruiterClient } from '../messaging/client.js';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';
import { HOST_ID, mountProfileSaveUi } from './profileSaveUi.js';

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
      expect(button().disabled).toBe(true);
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
    it('opens a prefilled panel on click', async () => {
      loadProfilePage();
      await mountProfileSaveUi({ client: fakeClient() });

      button().click();

      const name = shadow().querySelector<HTMLInputElement>('[aria-label="Name"]')!;
      expect(name.value).toBe('Jane Placeholder');
    });

    it('does not open a second panel on a repeated click', async () => {
      loadProfilePage();
      await mountProfileSaveUi({ client: fakeClient() });

      button().click();
      button().click();

      expect(shadow().querySelectorAll('.panel')).toHaveLength(1);
    });

    it('saves a well-formed recruiter and flips the button', async () => {
      loadProfilePage();
      const client = fakeClient();
      await mountProfileSaveUi({ client });

      button().click();
      shadow().querySelector('form')!.requestSubmit();
      await vi.waitFor(() => expect(client.save).toHaveBeenCalled());

      expect(client.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Placeholder',
          profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
          outreach: 'not-contacted',
          schemaVersion: SCHEMA_VERSION,
          source: expect.objectContaining({ type: 'profile' }),
        }),
      );

      await vi.waitFor(() => expect(button().textContent).toBe('Saved ✓'));
      expect(shadow().querySelector('.panel')).toBeNull();
    });

    it('carries the member id through so dedupe survives a URL change', async () => {
      loadProfilePage();
      const client = fakeClient();
      await mountProfileSaveUi({ client });

      button().click();
      shadow().querySelector('form')!.requestSubmit();
      await vi.waitFor(() => expect(client.save).toHaveBeenCalled());

      expect(client.save).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: expect.stringMatching(/^ACoAA/) }),
      );
    });

    it('shows the failure and keeps the panel open when saving fails', async () => {
      loadProfilePage();
      const client = fakeClient({ save: vi.fn().mockRejectedValue(new Error('sync is full')) });
      await mountProfileSaveUi({ client });

      button().click();
      shadow().querySelector('form')!.requestSubmit();

      await vi.waitFor(() =>
        expect(shadow().querySelector('.error')?.textContent).toContain('sync is full'),
      );
      // The button must not claim success, and the panel must not discard what
      // the user typed.
      expect(button().textContent).toBe('Save');
      expect(shadow().querySelector('.panel')).not.toBeNull();
    });
  });
});
