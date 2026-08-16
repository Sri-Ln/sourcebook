import type { Recruiter } from '../models/types.js';
import type { SavePanelValues } from '../ui/savePanel.js';

/** Seeds the edit form from a saved record. */
export function toPanelValues(recruiter: Recruiter): Partial<SavePanelValues> {
  return {
    name: recruiter.name,
    headline: recruiter.headline ?? '',
    company: recruiter.company ?? '',
    sourceType: recruiter.source.type,
    sourceUrl: recruiter.source.url ?? '',
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
 * A field cleared to blank is **omitted entirely** rather than stored as an
 * empty string. "Not known" stays distinguishable from "known to be empty", and
 * an empty string would otherwise spend sync quota to say nothing.
 */
export function applyEdits(
  recruiter: Recruiter,
  values: SavePanelValues,
  now = new Date(),
): Recruiter {
  const headline = values.headline.trim();
  const company = values.company.trim();
  const note = values.note.trim();
  const sourceUrl = values.sourceUrl.trim();
  const followUpAt = values.followUpAt.trim();

  // A link only means something for a source that has one. Keeping a stale post
  // URL against "their profile" would be a quiet lie about where someone came
  // from — which is the one thing this field exists to record.
  const keepsUrl = values.sourceType !== 'profile' && values.sourceType !== 'manual';

  return {
    id: recruiter.id,
    schemaVersion: recruiter.schemaVersion,
    // Empty falls back rather than wiping: a record with no name is unusable,
    // and the form already refuses to submit one.
    name: values.name.trim() || recruiter.name,
    profileUrl: recruiter.profileUrl,
    ...(recruiter.memberId ? { memberId: recruiter.memberId } : {}),
    ...(headline ? { headline } : {}),
    ...(company ? { company } : {}),
    outreach: recruiter.outreach,
    source: {
      type: values.sourceType,
      ...(sourceUrl && keepsUrl ? { url: sourceUrl } : {}),
    },
    tags: [...new Set(values.tags.map((tag) => tag.trim()).filter(Boolean))],
    ...(note ? { note } : {}),
    ...(followUpAt ? { followUpAt } : {}),
    savedAt: recruiter.savedAt,
    updatedAt: now.toISOString(),
  };
}
