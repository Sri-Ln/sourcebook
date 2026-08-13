import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTE_MAX_LENGTH } from '../models/types.js';
import type { ProfileDraft } from '../extractors/profile.js';
import { createSavePanel } from './savePanel.js';

function draft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    name: 'Jane Placeholder',
    headline: 'Technical Recruiter at Placeholder Corp',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    memberId: 'ACoAAEXAMPLE',
    company: undefined,
    warnings: [],
    ...overrides,
  };
}

function mount(options: Partial<Parameters<typeof createSavePanel>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const form = createSavePanel({ draft: draft(), onSubmit, onCancel, ...options });
  document.body.append(form);
  return { form, onSubmit, onCancel };
}

const input = (form: HTMLFormElement, label: string) =>
  form.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

describe('createSavePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefills what extraction found', () => {
    const { form } = mount();

    expect(input(form, 'Name').value).toBe('Jane Placeholder');
    expect(input(form, 'Headline').value).toBe('Technical Recruiter at Placeholder Corp');
  });

  it('is usable when extraction found nothing', () => {
    const { form } = mount({
      draft: { company: undefined, warnings: ['name: heading not found'] },
    });

    // Extraction failing must degrade to a blank form, never to a broken one.
    expect(input(form, 'Name').value).toBe('');
    expect(form.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('submits the edited values rather than the extracted ones', () => {
    const { form, onSubmit } = mount();

    input(form, 'Name').value = 'Corrected Name';
    input(form, 'Company').value = 'Placeholder Corp';
    form.requestSubmit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Corrected Name', company: 'Placeholder Corp' }),
    );
  });

  it('refuses to submit without a name', () => {
    const { form, onSubmit } = mount();

    input(form, 'Name').value = '   ';
    form.requestSubmit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('splits tags on commas and drops the empties', () => {
    const { form, onSubmit } = mount();

    input(form, 'Tags').value = 'fintech, , sponsors-h1b ,';
    form.requestSubmit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['fintech', 'sponsors-h1b'] }),
    );
  });

  describe('note counter', () => {
    it('starts at zero of the cap', () => {
      const { form } = mount();

      expect(form.querySelector('.counter')?.textContent).toBe(`0/${NOTE_MAX_LENGTH}`);
    });

    it('updates as you type', () => {
      const { form } = mount();
      const note = form.querySelector('textarea')!;

      note.value = 'Posted about backend openings';
      note.dispatchEvent(new Event('input'));

      expect(form.querySelector('.counter')?.textContent).toBe(`29/${NOTE_MAX_LENGTH}`);
    });

    it('flags when the cap is reached', () => {
      const { form } = mount();
      const note = form.querySelector('textarea')!;

      note.value = 'x'.repeat(NOTE_MAX_LENGTH);
      note.dispatchEvent(new Event('input'));

      // Sync storage has a hard byte ceiling; discovering the limit after
      // writing is worse than seeing it while you write.
      expect(form.querySelector('.counter')?.classList.contains('counter--full')).toBe(true);
    });

    it('caps the field itself so the limit cannot be exceeded', () => {
      const { form } = mount();

      expect(form.querySelector('textarea')?.maxLength).toBe(NOTE_MAX_LENGTH);
    });
  });

  describe('source', () => {
    it('defaults to the profile, the only thing the page can tell us', () => {
      const { form } = mount();

      expect(form.querySelector('select')?.value).toBe('profile');
    });

    it('hides the source link until it means something', () => {
      const { form } = mount();
      const url = input(form, 'Source link');

      expect(url.hidden).toBe(true);

      const select = form.querySelector('select')!;
      select.value = 'post';
      select.dispatchEvent(new Event('change'));

      expect(url.hidden).toBe(false);
    });

    it('submits the chosen source and its link', () => {
      const { form, onSubmit } = mount();

      const select = form.querySelector('select')!;
      select.value = 'post';
      select.dispatchEvent(new Event('change'));
      input(form, 'Source link').value = 'https://www.linkedin.com/posts/abc';
      form.requestSubmit();

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'post',
          sourceUrl: 'https://www.linkedin.com/posts/abc',
        }),
      );
    });
  });

  it('cancels without submitting', () => {
    const { form, onSubmit, onCancel } = mount();

    form.querySelector<HTMLButtonElement>('button[type="button"]')!.click();

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
