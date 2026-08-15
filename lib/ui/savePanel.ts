import { NOTE_MAX_LENGTH, SOURCE_TYPES, type SourceType } from '../models/types.js';

export interface SavePanelValues {
  name: string;
  headline: string;
  company: string;
  sourceType: SourceType;
  sourceUrl: string;
  note: string;
  tags: string[];
}

/** Everything the form can be seeded with. All optional: a blank form is valid. */
export type SavePanelInitial = Partial<SavePanelValues>;

export interface SavePanelOptions {
  initial?: SavePanelInitial;
  /** Label on the confirm button. */
  submitLabel?: string;
  onSubmit: (values: SavePanelValues) => void | Promise<void>;
  onCancel: () => void;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  profile: 'Their profile',
  post: 'A post',
  search: 'Search results',
  manual: 'Typed by hand',
};

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

/**
 * The edit form.
 *
 * Saving itself is one click and needs no form. This exists for afterwards:
 * adding the note you meant to write, fixing a company extraction guessed
 * wrong, or recording that you found someone through a post rather than by
 * browsing. Those are the corrections worth making against the whole
 * collection rather than in the moment.
 *
 * Every field is editable, including ones extraction filled in. Extraction is
 * best-effort against markup that changes without warning, so the user must
 * always be able to correct it — and when extraction fails entirely the same
 * form is simply blank rather than broken.
 */
export function createSavePanel({
  initial = {},
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: SavePanelOptions): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'panel';

  const name = document.createElement('input');
  name.type = 'text';
  name.required = true;
  name.value = initial.name ?? '';
  name.setAttribute('aria-label', 'Name');

  const headline = document.createElement('input');
  headline.type = 'text';
  headline.value = initial.headline ?? '';
  headline.setAttribute('aria-label', 'Headline');

  const company = document.createElement('input');
  company.type = 'text';
  company.value = initial.company ?? '';
  company.setAttribute('aria-label', 'Company');

  const sourceType = document.createElement('select');
  sourceType.setAttribute('aria-label', 'Where you found them');
  for (const type of SOURCE_TYPES) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = SOURCE_LABELS[type];
    sourceType.append(option);
  }
  // A profile page cannot report how you arrived, so this defaults to the only
  // thing we actually know and stays one click from the truth.
  sourceType.value = initial.sourceType ?? 'profile';

  const sourceUrl = document.createElement('input');
  sourceUrl.type = 'url';
  sourceUrl.placeholder = 'Link to the post (optional)';
  sourceUrl.setAttribute('aria-label', 'Source link');
  sourceUrl.value = initial.sourceUrl ?? '';
  sourceUrl.hidden = sourceType.value === 'profile' || sourceType.value === 'manual';

  // The URL only means something for a source that has one.
  sourceType.addEventListener('change', () => {
    sourceUrl.hidden = sourceType.value === 'profile' || sourceType.value === 'manual';
  });

  const note = document.createElement('textarea');
  note.rows = 2;
  note.maxLength = NOTE_MAX_LENGTH;
  note.placeholder = 'Why they matter, what they were hiring for…';
  note.setAttribute('aria-label', 'Note');
  note.value = initial.note ?? '';

  const counter = document.createElement('span');
  counter.className = 'counter';
  const renderCount = () => {
    counter.textContent = `${note.value.length}/${NOTE_MAX_LENGTH}`;
    // Shown live rather than enforced on submit: notes sync to a namespace with
    // a hard byte ceiling, and discovering the limit after writing is worse
    // than seeing it while you write.
    counter.classList.toggle('counter--full', note.value.length >= NOTE_MAX_LENGTH);
  };
  renderCount();
  note.addEventListener('input', renderCount);

  const tags = document.createElement('input');
  tags.type = 'text';
  tags.placeholder = 'fintech, sponsors-h1b';
  tags.setAttribute('aria-label', 'Tags');
  tags.value = (initial.tags ?? []).join(', ');

  const error = document.createElement('p');
  error.className = 'error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = submitLabel;

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', onCancel);

  const actions = document.createElement('div');
  actions.className = 'panel__actions';
  actions.append(counter, cancel, save);

  form.append(
    field('Name', name),
    field('Headline', headline),
    field('Company', company),
    field('Found via', sourceType),
    sourceUrl,
    field('Note', note),
    field('Tags', tags),
    error,
    actions,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!name.value.trim()) {
      error.textContent = 'A name is required.';
      error.hidden = false;
      name.focus();
      return;
    }

    error.hidden = true;

    void onSubmit({
      name: name.value.trim(),
      headline: headline.value.trim(),
      company: company.value.trim(),
      sourceType: sourceType.value as SourceType,
      sourceUrl: sourceUrl.value.trim(),
      note: note.value.trim(),
      tags: tags.value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  });

  return form;
}
