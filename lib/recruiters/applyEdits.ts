import type { Recruiter } from '../models/types.js';

/**
 * What the edit form collects.
 *
 * Four fields, where there were seven. Name, headline and provenance were
 * dropped from the form as noise; they still live on the record and are carried
 * through untouched by {@link applyEdits}.
 *
 * Declared here rather than beside the form so nothing in `lib/` has to depend
 * on a component to describe a record's own editable shape.
 */
export interface EditValues {
  company: string;
  note: string;
  tags: string[];
  /** `YYYY-MM-DD`, or empty for no reminder. */
  followUpAt: string;
}

/** Seeds the edit form from a saved record. */
export function toEditValues(recruiter: Recruiter): EditValues {
  return {
    company: recruiter.company ?? '',
    note: recruiter.note ?? '',
    tags: recruiter.tags,
    followUpAt: recruiter.followUpAt ?? '',
  };
}

/**
 * Applies edited values to a saved record.
 *
 * Identity is preserved deliberately: `id`, `savedAt`, `profileUrl` and
 * `memberId` are not editable here. Changing them would either orphan the
 * record from the person it describes, or silently create a duplicate that the
 * dedupe check would no longer catch.
 *
 * `name`, `headline` and `source` are preserved for a different reason: the form
 * stopped offering them, so it has nothing to say about them. Passing them
 * through the same "blank means omit" rule as the editable fields would delete a
 * headline every time someone fixed a typo in a note.
 *
 * Among the fields it does own, one cleared to blank is **omitted entirely**
 * rather than stored as an empty string. "Not known" stays distinguishable from
 * "known to be empty", and an empty string would otherwise spend sync quota to
 * say nothing.
 */
export function applyEdits(
  recruiter: Recruiter,
  values: EditValues,
  now = new Date(),
): Recruiter {
  const company = values.company.trim();
  const note = values.note.trim();
  const followUpAt = values.followUpAt.trim();

  return {
    id: recruiter.id,
    schemaVersion: recruiter.schemaVersion,
    name: recruiter.name,
    profileUrl: recruiter.profileUrl,
    ...(recruiter.memberId ? { memberId: recruiter.memberId } : {}),
    ...(recruiter.headline ? { headline: recruiter.headline } : {}),
    ...(company ? { company } : {}),
    outreach: recruiter.outreach,
    source: recruiter.source,
    tags: [...new Set(values.tags.map((tag) => tag.trim()).filter(Boolean))],
    ...(note ? { note } : {}),
    ...(followUpAt ? { followUpAt } : {}),
    savedAt: recruiter.savedAt,
    updatedAt: now.toISOString(),
  };
}
