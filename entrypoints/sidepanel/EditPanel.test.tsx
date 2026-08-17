import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type Recruiter } from '../../lib/models/types.js';
import { EditPanel } from './EditPanel.js';

function recruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'jane',
    schemaVersion: SCHEMA_VERSION,
    name: 'Jane Placeholder',
    profileUrl: 'https://www.linkedin.com/in/jane-placeholder',
    company: 'Postman',
    outreach: 'not-contacted',
    source: { type: 'profile' },
    tags: [],
    savedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Ranked as `rankTags` would return them: most-used first. */
const RANKED = ['fintech', 'backend', 'seed-stage', 'sponsors-h1b', 'warm-intro', 'remote'];

function setup(over: Partial<Parameters<typeof EditPanel>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();

  render(
    <EditPanel
      recruiter={over.recruiter ?? recruiter()}
      tagSuggestions={over.tagSuggestions ?? RANKED}
      onSave={over.onSave ?? onSave}
      onCancel={over.onCancel ?? onCancel}
    />,
  );

  return { onSave, onCancel };
}

const tagField = () => screen.getByLabelText('Tags');
const chips = () =>
  screen.queryAllByRole('button', { name: /^Add tag / }).map((b) => b.textContent);

describe('EditPanel tag suggestions', () => {
  it('offers only the three most-used tags at rest', () => {
    setup();

    // A shortcut with twenty options in it is just a list.
    expect(chips()).toEqual(['fintech', 'backend', 'seed-stage']);
  });

  it('shows nothing at all before any tags exist', () => {
    setup({ tagSuggestions: [] });

    // No empty row on a first-run panel.
    expect(chips()).toEqual([]);
  });

  it('adds a tag to the field when a chip is pressed', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add tag backend' }));

    expect(tagField()).toHaveValue('backend, ');
  });

  it('stops offering a tag once it is on the record', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add tag fintech' }));

    await waitFor(() => expect(chips()).not.toContain('fintech'));
    // And the next-ranked tag moves up into the gap.
    expect(chips()).toEqual(['backend', 'seed-stage', 'sponsors-h1b']);
  });

  it('does not offer tags the record already had', () => {
    setup({ recruiter: recruiter({ tags: ['fintech', 'backend'] }) });

    expect(chips()).toEqual(['seed-stage', 'sponsors-h1b', 'warm-intro']);
  });

  it('reaches a tag outside the top three by typing', async () => {
    setup();

    // warm-intro is fifth, so it is unreachable from the resting row.
    await userEvent.type(tagField(), 'warm');

    await waitFor(() => expect(chips()).toEqual(['warm-intro']));
  });

  it('matches the tag being typed, not the whole field', async () => {
    setup();

    await userEvent.type(tagField(), 'fintech, spon');

    // This is what a native datalist cannot do: it would look for a tag called
    // "fintech, spon" and offer nothing.
    await waitFor(() => expect(chips()).toEqual(['sponsors-h1b']));
  });

  it('completes the part-typed tag rather than appending to it', async () => {
    setup();

    await userEvent.type(tagField(), 'fintech, spon');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag sponsors-h1b' }));

    expect(tagField()).toHaveValue('fintech, sponsors-h1b, ');
  });

  it('returns to the resting three after a tag is accepted', async () => {
    setup();

    await userEvent.type(tagField(), 'warm');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag warm-intro' }));

    await waitFor(() => expect(chips()).toEqual(['fintech', 'backend', 'seed-stage']));
  });

  it('offers nothing when the typed fragment matches no tag', async () => {
    setup();

    await userEvent.type(tagField(), 'zzz');

    await waitFor(() => expect(chips()).toEqual([]));
  });

  it('saves the tags added by chip', async () => {
    const { onSave } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Add tag fintech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add tag backend' }));
    await userEvent.click(screen.getByRole('button', { name: /Update/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['fintech', 'backend'] }),
    );
  });

  it('names each chip for what pressing it does', () => {
    setup();

    // "fintech" on its own does not say that out loud.
    expect(screen.getByRole('button', { name: 'Add tag fintech' })).toBeDefined();
  });

  it('groups the suggestions and says what they are', () => {
    setup();

    expect(screen.getByRole('group', { name: /Most used tags/i })).toBeDefined();
  });

  it('relabels the group while filtering, so the change is announced', async () => {
    setup();

    await userEvent.type(tagField(), 'warm');

    await waitFor(() =>
      expect(screen.getByRole('group', { name: /Tags matching warm/i })).toBeDefined(),
    );
  });
});
