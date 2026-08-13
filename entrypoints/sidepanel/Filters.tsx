import { OUTREACH_STATUSES, type OutreachStatus } from '../../lib/models/types.js';
import type { RecruiterFilter } from '../../lib/recruiters/filter.js';

export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  'not-contacted': 'Not contacted',
  messaged: 'Messaged',
  replied: 'Replied',
  referred: 'Referred',
  closed: 'Closed',
};

export interface FiltersProps {
  filter: RecruiterFilter;
  tags: string[];
  onChange: (filter: RecruiterFilter) => void;
}

export function Filters({ filter, tags, onChange }: FiltersProps) {
  const toggleStatus = (status: OutreachStatus) => {
    const statuses = filter.statuses.includes(status)
      ? filter.statuses.filter((s) => s !== status)
      : [...filter.statuses, status];
    onChange({ ...filter, statuses });
  };

  const toggleTag = (tag: string) => {
    const next = filter.tags.includes(tag)
      ? filter.tags.filter((t) => t !== tag)
      : [...filter.tags, tag];
    onChange({ ...filter, tags: next });
  };

  return (
    <div className="filters">
      <input
        type="search"
        className="filters__search"
        placeholder="Search name, company, note…"
        aria-label="Search saved recruiters"
        value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.target.value })}
      />

      <div className="filters__chips" role="group" aria-label="Filter by outreach status">
        {OUTREACH_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="chip"
            aria-pressed={filter.statuses.includes(status)}
            onClick={() => toggleStatus(status)}
          >
            {OUTREACH_LABELS[status]}
          </button>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className="filters__chips" role="group" aria-label="Filter by tag">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="chip chip--tag"
              aria-pressed={filter.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
