import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SYNC_QUOTA_BYTES } from '../../lib/storage/SyncProvider.js';
import { QuotaMeter } from './QuotaMeter.js';

const usage = (used: number) => ({
  used,
  quota: SYNC_QUOTA_BYTES,
  fraction: used / SYNC_QUOTA_BYTES,
});

describe('QuotaMeter', () => {
  it('reports usage in bytes and as a percentage', () => {
    render(<QuotaMeter usage={usage(25_600)} />);

    expect(screen.getByText(/25 KB of 100 KB/)).toBeDefined();
    expect(screen.getByText(/used \(25%\)/)).toBeDefined();
  });

  it('exposes the reading to assistive technology, not only as a coloured bar', () => {
    render(<QuotaMeter usage={usage(51_200)} />);

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('explains what the ceiling actually is', () => {
    // "100 KB" means nothing on its own. Records is the unit the user thinks in.
    render(<QuotaMeter usage={usage(1_000)} />);

    expect(screen.getByText(/recruiters/i)).toBeDefined();
  });

  it('says nothing alarming while there is room', () => {
    render(<QuotaMeter usage={usage(SYNC_QUOTA_BYTES * 0.5)} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns at 80% and says what to do next', () => {
    render(<QuotaMeter usage={usage(SYNC_QUOTA_BYTES * 0.8)} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/80%/);
    // A warning with no remedy is just anxiety.
    expect(alert.textContent).toMatch(/export/i);
  });

  it('distinguishes full from nearly full', () => {
    // "Nearly full" is advice. "Full" means new saves stop syncing, which the
    // user has to be told outright rather than left to infer from a red bar.
    render(<QuotaMeter usage={usage(SYNC_QUOTA_BYTES)} />);

    expect(screen.getByRole('alert').textContent).toMatch(/this device only|not sync/i);
  });

  it('never draws a bar wider than its track', () => {
    render(<QuotaMeter usage={usage(SYNC_QUOTA_BYTES * 3)} />);

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });
});
