import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../tests/helpers/loadFixture.js';
import { extractProfile } from './profile.js';

const FIXTURES = ['profile-recruiter-1', 'profile-recruiter-2', 'profile-recruiter-3'] as const;

describe('extractProfile', () => {
  describe.each(FIXTURES)('%s', (fixture) => {
    it('extracts the name', () => {
      expect(extractProfile(loadFixture(fixture)).name).toBe('Jane Placeholder');
    });

    it('extracts a canonical profile URL', () => {
      const { profileUrl } = extractProfile(loadFixture(fixture));

      expect(profileUrl).toBe('https://www.linkedin.com/in/jane-placeholder');
    });

    it('extracts a stable member id', () => {
      // Vanity URLs are user-changeable and rot; the member id does not.
      expect(extractProfile(loadFixture(fixture)).memberId).toMatch(/^ACoAA/);
    });

    it('extracts a headline', () => {
      const { headline } = extractProfile(loadFixture(fixture));

      expect(headline).toBeTruthy();
      expect(headline).not.toMatch(/^·/);
    });

    it('never guesses the company', () => {
      // A wrong company is worse than a blank one: blanks get filled in,
      // wrong values never get corrected. Extraction lands in #29.
      expect(extractProfile(loadFixture(fixture)).company).toBeUndefined();
    });
  });

  it('reads the headline past pronouns and degree markers', () => {
    // This fixture carries "She/Her", "· 1st" and "· 2nd" before the headline.
    expect(extractProfile(loadFixture('profile-recruiter-1')).headline).toBe(
      'People Team, Operations & Recruiting',
    );
  });

  it('reads a headline that names the company', () => {
    expect(extractProfile(loadFixture('profile-recruiter-2')).headline).toBe(
      'Senior Talent Acquisition Partner at Fidelity Investments',
    );
  });

  describe('when the page is not what we expect', () => {
    function docFrom(html: string): Document {
      return new DOMParser().parseFromString(html, 'text/html');
    }

    it('returns an empty draft rather than throwing', () => {
      const draft = extractProfile(docFrom('<html><body><p>Nothing here</p></body></html>'));

      // A restructured page is an ordinary outcome, not an exception. The panel
      // opens with blank fields and the user types them.
      expect(draft.name).toBeUndefined();
      expect(draft.headline).toBeUndefined();
    });

    it('records which strategies failed, so selector rot is visible', () => {
      const draft = extractProfile(docFrom('<html><body></body></html>'));

      expect(draft.warnings.length).toBeGreaterThan(0);
      expect(draft.warnings.join(' ')).toMatch(/name/i);
    });

    it('falls back to the document title when the name element is gone', () => {
      const draft = extractProfile(
        docFrom('<html><head><title>Someone Else | LinkedIn</title></head><body></body></html>'),
      );

      expect(draft.name).toBe('Someone Else');
      // Still a warning: the page changed, even though a fallback covered it.
      expect(draft.warnings.join(' ')).toMatch(/title/i);
    });

    it('ignores a title that is not a profile title', () => {
      const draft = extractProfile(
        docFrom('<html><head><title>LinkedIn</title></head><body></body></html>'),
      );

      expect(draft.name).toBeUndefined();
    });
  });

  describe('profile URL normalisation', () => {
    function withHref(href: string): Document {
      return new DOMParser().parseFromString(
        `<html><body><main><a href="${href}"><h2>Jane Placeholder</h2></a></main></body></html>`,
        'text/html',
      );
    }

    it('strips tracking query strings', () => {
      expect(extractProfile(withHref('https://www.linkedin.com/in/jane/?trk=abc')).profileUrl).toBe(
        'https://www.linkedin.com/in/jane',
      );
    });

    it('strips a trailing slash', () => {
      expect(extractProfile(withHref('https://www.linkedin.com/in/jane/')).profileUrl).toBe(
        'https://www.linkedin.com/in/jane',
      );
    });

    it('lowercases the slug so dedupe is reliable', () => {
      expect(extractProfile(withHref('https://www.linkedin.com/in/Jane-P/')).profileUrl).toBe(
        'https://www.linkedin.com/in/jane-p',
      );
    });

    it('resolves a relative href to an absolute URL', () => {
      expect(extractProfile(withHref('/in/jane/')).profileUrl).toBe(
        'https://www.linkedin.com/in/jane',
      );
    });
  });
});
