import { OUTREACH_STATUSES, type OutreachStatus, type Recruiter } from '../../lib/models/types.js';
import { groupByCompany } from '../../lib/recruiters/groupByCompany.js';
import { EditPanel } from './EditPanel.js';
import { OUTREACH_LABELS } from './Filters.js';

export interface RecruiterGroupsProps {
  recruiters: Recruiter[];
  overflowedIds: string[];
  editingId?: string | undefined;
  onStatusChange: (recruiter: Recruiter, outreach: OutreachStatus) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string | undefined) => void;
  onSaveEdit: (updated: Recruiter) => Promise<void>;
}

/**
 * The saved list, grouped by employer.
 *
 * Company is the axis that matters: you look someone up because a role opened
 * where they work, not because of when you saved them. It also makes it obvious
 * at a glance when you already know three people somewhere.
 *
 * Each card carries a name and a role, and nothing else. Everything the record
 * holds — tags, notes, provenance, dates — is available but not shown: a list
 * you scan is only useful if there is little to read per row.
 */
export function RecruiterGroups({
  recruiters,
  overflowedIds,
  editingId,
  onStatusChange,
  onRemove,
  onEdit,
  onSaveEdit,
}: RecruiterGroupsProps) {
  const groups = groupByCompany(recruiters);

  return (
    <div className="groups">
      {groups.map((group) => (
        <section key={group.company} className="group">
          <h2 className="group__name">
            {group.company}
            <span className="group__count">{group.recruiters.length}</span>
          </h2>

          <ul className="cards">
            {group.recruiters.map((recruiter) => (
              <li key={recruiter.id} className="card">
                <div className="card__body">
                  <a
                    className="card__name"
                    href={recruiter.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {recruiter.name}
                  </a>

                  {/* The role, as subtext. Truncated in CSS rather than in JS so
                      the full value stays selectable and available on hover. */}
                  {recruiter.headline ? (
                    <p className="card__role" title={recruiter.headline}>
                      {recruiter.headline}
                    </p>
                  ) : null}
                </div>

                <div className="card__actions">
                  <select
                    className={`status status--${recruiter.outreach}`}
                    aria-label={`Outreach status for ${recruiter.name}`}
                    value={recruiter.outreach}
                    onChange={(event) =>
                      onStatusChange(recruiter, event.target.value as OutreachStatus)
                    }
                  >
                    {OUTREACH_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {OUTREACH_LABELS[status]}
                      </option>
                    ))}
                  </select>

                  {overflowedIds.includes(recruiter.id) ? (
                    <span className="warning" title="Sync storage is full — saved on this device only">
                      !
                    </span>
                  ) : null}

                  <button
                    type="button"
                    className="card__edit-toggle"
                    aria-label={`Edit ${recruiter.name}`}
                    aria-expanded={editingId === recruiter.id}
                    onClick={() => onEdit(editingId === recruiter.id ? undefined : recruiter.id)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="card__remove"
                    aria-label={`Remove ${recruiter.name}`}
                    onClick={() => onRemove(recruiter.id)}
                  >
                    ×
                  </button>
                </div>

                {editingId === recruiter.id ? (
                  <EditPanel
                    recruiter={recruiter}
                    onSave={onSaveEdit}
                    onCancel={() => onEdit(undefined)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
