import type { ProfileDraft } from '../extractors/profile.js';
import { SCHEMA_VERSION, type Recruiter } from '../models/types.js';

/**
 * Turns what extraction found into a record ready to save.
 *
 * Saving is one click: no form, no confirmation. Whatever extraction produced
 * is stored as-is, and anything wrong or missing gets corrected from the list
 * later. A confirm step on every save taxes the common case — where the
 * extraction is simply right — to serve the rare one.
 *
 * Optional fields are omitted rather than stored empty, so a blank does not
 * occupy sync quota and `undefined` keeps meaning "not known".
 */
export function draftToRecruiter(draft: ProfileDraft, now = new Date()): Recruiter {
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    // A record with no name is useless, and refusing to save one would lose the
    // click entirely. The URL at least makes it findable and correctable.
    name: draft.name?.trim() || 'Unknown',
    profileUrl: draft.profileUrl ?? '',
    ...(draft.memberId ? { memberId: draft.memberId } : {}),
    ...(draft.headline ? { headline: draft.headline } : {}),
    ...(draft.company ? { company: draft.company } : {}),
    outreach: 'not-contacted',
    // A profile page cannot report how you arrived. Changeable from the list.
    source: { type: 'profile' },
    tags: [],
    savedAt: timestamp,
    updatedAt: timestamp,
  };
}
