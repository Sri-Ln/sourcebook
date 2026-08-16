import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTE_MAX_LENGTH } from '../models/types.js';
import { createSavePanel } from './savePanel.js';

function seed(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Jane Placeholder',
    headline: 'Technical Recruiter at Placeholder Corp',
    ...overrides,
  };
}

function mount(options: Partial<Parameters<typeof createSavePanel>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const form = createSavePanel({ initial: seed(), onSubmit, onCancel, ...options });
  document.body.append(form);
  return { form, onSubmit, onCancel };
}

const input = (form: HTMLFormElement, label: string) =>
  form.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

describe('createSavePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefills the values it is given', () => {
    const { form } = mount();

    expect(input(form, 'Name').value).toBe('Jane Placeholder');
    expect(input(form, 'Headline').value).toBe('Technical Recruiter at Placeholder Corp');
  });

  it('is usable when extraction found nothing', () => {
    const { form } = mount({ initial: {} });

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

  describe('editing an existing record', () => {
    it('prefills the note, which is otherwise unwritable', () => {
      const { form } = mount({ initial: seed({ note: 'Posted about backend openings' }) });

      expect(form.querySelector('textarea')?.value).toBe('Posted about backend openings');
    });

    it('prefills tags as a comma-separated list', () => {
      const { form } = mount({ initial: seed({ tags: ['fintech', 'remote'] }) });

      expect(input(form, 'Tags').value).toBe('fintech, remote');
    });

    it('prefills the source and reveals its link when there is one', () => {
      const { form } = mount({
        initial: seed({ sourceType: 'post', sourceUrl: 'https://example.com/post' }),
      });

      expect(form.querySelector('select')?.value).toBe('post');
      // Hidden by default, but a seeded post URL means it already applies.
      expect(input(form, 'Source link').hidden).toBe(false);
      expect(input(form, 'Source link').value).toBe('https://example.com/post');
    });

    it('counts a prefilled note straight away', () => {
      const { form } = mount({ initial: seed({ note: 'abc' }) });

      expect(form.querySelector('.counter')?.textContent).toBe(`3/${NOTE_MAX_LENGTH}`);
    });

    it('can relabel the confirm button', () => {
      const { form } = mount({ submitLabel: 'Update' });

      expect(form.querySelector('button[type="submit"]')?.textContent).toBe('Update');
    });
  });

  describe('follow-up date', () => {
    it('submits the chosen date', () => {
      const { form, onSubmit } = mount();

      input(form, 'Follow up on').value = '2026-09-15';
      form.requestSubmit();

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ followUpAt: '2026-09-15' }),
      );
    });

    it('prefills an existing date and offers a way to clear it', () => {
      const { form } = mount({ initial: seed({ followUpAt: '2026-09-15' }) });

      expect(input(form, 'Follow up on').value).toBe('2026-09-15');
      expect(input(form, 'Clear follow-up date').hidden).toBe(false);
    });

    it('hides the clear control when there is no date', () => {
      const { form } = mount();

      expect(input(form, 'Clear follow-up date').hidden).toBe(true);
    });

    it('clears the date', () => {
      const { form, onSubmit } = mount({ initial: seed({ followUpAt: '2026-09-15' }) });

      // A date input offers no obvious route back to empty once set.
      form.querySelector<HTMLButtonElement>('[aria-label="Clear follow-up date"]')!.click();
      form.requestSubmit();

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ followUpAt: '' }));
    });
  });

  it('cancels without submitting', () => {
    const { form, onSubmit, onCancel } = mount();

    [...form.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Cancel')!
      .click();

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
