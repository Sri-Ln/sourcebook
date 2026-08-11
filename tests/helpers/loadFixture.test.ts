import { describe, expect, it } from 'vitest';
import { availableFixtures, loadFixture } from './loadFixture.js';

describe('loadFixture', () => {
  it('parses a scrubbed fixture into a queryable Document', () => {
    const doc = loadFixture('profile-placeholder');

    expect(doc.querySelector('h1')?.textContent?.trim()).toBe('Jane Placeholder');
  });

  it('preserves nested structure rather than flattening it', () => {
    const doc = loadFixture('profile-placeholder');

    // Extractors depend on descendant selectors surviving the round trip,
    // since LinkedIn's real markup is deeply nested.
    const headline = doc.querySelector('.pv-text-details__left-panel .headline');
    expect(headline?.textContent?.trim()).toBe('Technical Recruiter at Placeholder Corp');
  });

  it('throws a message that names the fixture and points at the scrub docs', () => {
    expect(() => loadFixture('does-not-exist')).toThrowError(
      /does-not-exist.*tests\/fixtures\/README\.md/s,
    );
  });

  it('lists the committed fixtures', () => {
    expect(availableFixtures()).toContain('profile-placeholder');
  });

  it('never exposes the gitignored raw directory', () => {
    // Raw captures hold real people's data. A helper that could reach them
    // from a test is a helper that will eventually put one in a snapshot.
    expect(() => loadFixture('../raw/anything')).toThrowError(/outside/i);
  });
});
