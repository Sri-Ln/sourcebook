import { describe, expect, it } from 'vitest';

describe('branch protection verification', () => {
  it('fails deliberately, to prove CI blocks the merge button (#4)', () => {
    // This file exists only to verify that a failing check actually prevents
    // merging. The PR that carries it is closed and the branch deleted once
    // that is confirmed. It must never reach main.
    expect(true).toBe(false);
  });
});
