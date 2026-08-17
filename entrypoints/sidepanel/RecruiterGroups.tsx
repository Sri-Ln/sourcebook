import { useState } from 'react';
import type { OutreachStatus, Recruiter } from '../../lib/models/types.js';
import { dueLabel, isDue } from '../../lib/recruiters/followUp.js';
import { groupByCompany } from '../../lib/recruiters/groupByCompany.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { EditPanel } from './EditPanel.js';
import { StatusMenu } from './StatusMenu.js';

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

  /**
   * Who the × was pressed for, pending confirmation.
   *
   * The whole record rather than an id, so the dialog can name the person. It
   * also survives the record leaving the list: confirming removes it, and the
   * dialog unmounts on the same render rather than blanking first.
   */
  const [pending, setPending] = useState<Recruiter | undefined>(undefined);

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

                  {recruiter.followUpAt ? (
                    <p
                      className={`card__due${isDue(recruiter) ? ' card__due--now' : ''}`}
                      title={`Follow up on ${recruiter.followUpAt}`}
                    >
                      {dueLabel(recruiter.followUpAt)}
                    </p>
                  ) : null}
                </div>

                <div className="card__actions">
                  <StatusMenu
                    value={recruiter.outreach}
                    personName={recruiter.name}
                    onChange={(status) => onStatusChange(recruiter, status)}
                  />

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

                  {/* Confirmed rather than immediate. Removal destroys the
                      note, tags, status and follow-up date added after saving,
                      none of which the page can reconstruct -- and this control
                      is one pixel from Edit on a row you were only scanning. */}
                  <button
                    type="button"
                    className="card__remove"
                    aria-label={`Remove ${recruiter.name}`}
                    onClick={() => setPending(recruiter)}
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

      {pending ? (
        <ConfirmDialog
          title={`Remove ${pending.name}?`}
          body="The note, tags, outreach status and follow-up date go too. This cannot be undone."
          confirmLabel="Remove"
          onConfirm={() => {
            onRemove(pending.id);
            setPending(undefined);
          }}
          onCancel={() => setPending(undefined)}
        />
      ) : null}
    </div>
  );
}
