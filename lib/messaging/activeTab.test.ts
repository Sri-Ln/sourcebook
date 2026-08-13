import { describe, expect, it } from 'vitest';
import { classifyUrl } from './activeTab.js';

describe('classifyUrl', () => {
  it('accepts a profile page', () => {
    expect(classifyUrl('https://www.linkedin.com/in/jane-placeholder/')).toMatchObject({
      savable: true,
    });
  });

  it('accepts a profile page on a regional subdomain', () => {
    expect(classifyUrl('https://uk.linkedin.com/in/jane/')).toMatchObject({ savable: true });
  });

  it('rejects a non-LinkedIn page with a reason', () => {
    const result = classifyUrl('https://example.com/in/jane');

    expect(result.savable).toBe(false);
    if (!result.savable) expect(result.reason).toMatch(/LinkedIn/i);
  });

  it('rejects a lookalike domain', () => {
    // "notlinkedin.com" must not pass a naive substring check.
    expect(classifyUrl('https://notlinkedin.com/in/jane')).toMatchObject({ savable: false });
  });

  it('rejects a LinkedIn page that is not a profile', () => {
    const result = classifyUrl('https://www.linkedin.com/jobs/view/123/');

    expect(result.savable).toBe(false);
    // A job page is savable in principle but not by this extractor, and a
    // button that yields a blank form is worse than no button.
    if (!result.savable) expect(result.reason).toMatch(/profile/i);
  });

  it('rejects the feed', () => {
    expect(classifyUrl('https://www.linkedin.com/feed/')).toMatchObject({ savable: false });
  });

  it('handles a missing URL', () => {
    expect(classifyUrl(undefined)).toMatchObject({ savable: false });
  });

  it('handles a malformed URL without throwing', () => {
    expect(classifyUrl('not a url')).toMatchObject({ savable: false });
  });
});
