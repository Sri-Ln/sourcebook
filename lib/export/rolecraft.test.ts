import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type JobDescription } from '../models/types.js';
import { JOB_SEPARATOR, formatForRolecraft } from './rolecraft.js';

function jd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    id: '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
    schemaVersion: SCHEMA_VERSION,
    title: 'Software Engineer, Platform',
    company: 'Stripe',
    url: 'https://linkedin.com/jobs/view/4123456789',
    rawText: 'We are looking for a platform engineer.',
    capturedAt: '2026-08-10T09:30:00.000Z',
    ...overrides,
  };
}

/**
 * Stands in for rolecraft's `process` mode, which splits the paste on lines
 * containing exactly `---NEW JOB---`. Asserting through this — rather than only
 * on substrings — is what proves the output cannot grow a phantom job.
 */
function splitAsRolecraftWould(text: string): string[] {
  return text.split(/^[^\S\n]*---NEW JOB---[^\S\n]*$/m);
}

describe('formatForRolecraft', () => {
  describe('separator placement', () => {
    it('returns an empty string for no job descriptions', () => {
      expect(formatForRolecraft([])).toBe('');
    });

    it('emits no separator at all for a single job description', () => {
      const output = formatForRolecraft([jd()]);

      expect(output).not.toContain(JOB_SEPARATOR);
      expect(splitAsRolecraftWould(output)).toHaveLength(1);
    });

    it('puts one separator between each pair of entries', () => {
      const output = formatForRolecraft([
        jd({ id: 'a', title: 'One' }),
        jd({ id: 'b', title: 'Two' }),
        jd({ id: 'c', title: 'Three' }),
      ]);

      expect(output.split(JOB_SEPARATOR)).toHaveLength(3);
      expect(splitAsRolecraftWould(output)).toHaveLength(3);
    });

    it('never leaves a trailing or leading separator', () => {
      const output = formatForRolecraft([jd({ id: 'a' }), jd({ id: 'b' })]);

      expect(output.startsWith(JOB_SEPARATOR)).toBe(false);
      expect(output.endsWith(JOB_SEPARATOR)).toBe(false);
      // A trailing separator would hand rolecraft an empty final segment.
      expect(splitAsRolecraftWould(output).every((segment) => segment.trim() !== '')).toBe(
        true,
      );
    });

    it('stands the separator alone on its own line', () => {
      const output = formatForRolecraft([jd({ id: 'a' }), jd({ id: 'b' })]);

      expect(output).toContain(`\n${JOB_SEPARATOR}\n`);
      // rolecraft only splits on a line containing *exactly* the marker, so a
      // line that merely contains it would be silently swallowed as body text.
      const separatorLines = output
        .split('\n')
        .filter((line) => line.includes(JOB_SEPARATOR));
      expect(separatorLines).toEqual([JOB_SEPARATOR]);
    });

    it('preserves the order it was given', () => {
      const output = formatForRolecraft([
        jd({ id: 'a', title: 'First' }),
        jd({ id: 'b', title: 'Second' }),
      ]);

      expect(output.indexOf('First')).toBeLessThan(output.indexOf('Second'));
    });
  });

  describe('entry shape', () => {
    it('renders the documented entry exactly', () => {
      const output = formatForRolecraft([
        jd({
          location: 'San Francisco, CA (Hybrid)',
          rawText: 'We are looking for a platform engineer.',
        }),
      ]);

      expect(output).toBe(
        [
          '## Software Engineer, Platform — Stripe',
          'Source: https://linkedin.com/jobs/view/4123456789',
          'Captured: 2026-08-10',
          'Location: San Francisco, CA (Hybrid)',
          '',
          'We are looking for a platform engineer.',
        ].join('\n'),
      );
    });

    it('reduces the captured timestamp to its UTC date', () => {
      // Late-evening UTC would roll back a day under a local-time conversion.
      const output = formatForRolecraft([jd({ capturedAt: '2026-08-10T23:45:00.000Z' })]);

      expect(output).toContain('Captured: 2026-08-10');
      expect(output).not.toContain('23:45');
    });

    it('passes a captured value through when it is not a timestamp', () => {
      // Formatting is not validation: a surprising value should be visible in
      // the export rather than silently replaced by a wrong date.
      const output = formatForRolecraft([jd({ capturedAt: 'unknown' })]);

      expect(output).toContain('Captured: unknown');
    });

    it('includes compensation when it is known', () => {
      const output = formatForRolecraft([jd({ compensation: '$180,000 — $240,000' })]);

      expect(output).toContain('Compensation: $180,000 — $240,000');
    });

    it('separates the metadata block from the body with one blank line', () => {
      const output = formatForRolecraft([jd({ rawText: 'Body starts here.' })]);

      expect(output).toContain('\nCaptured: 2026-08-10\n\nBody starts here.');
    });
  });

  describe('optional fields', () => {
    it('omits an absent location rather than leaving an empty label', () => {
      const output = formatForRolecraft([jd({ location: undefined })]);

      expect(output).not.toContain('Location');
    });

    it('omits an absent compensation rather than leaving an empty label', () => {
      const output = formatForRolecraft([jd({ compensation: undefined })]);

      expect(output).not.toContain('Compensation');
    });

    it('treats a whitespace-only optional field as absent', () => {
      const output = formatForRolecraft([jd({ location: '   ', compensation: '\t' })]);

      expect(output).not.toContain('Location');
      expect(output).not.toContain('Compensation');
    });

    it('trims a present optional field', () => {
      const output = formatForRolecraft([jd({ location: '  Remote (US)  ' })]);

      expect(output).toContain('Location: Remote (US)\n');
    });
  });

  describe('hostile raw text', () => {
    it('defuses a separator that appears inside the description', () => {
      // Otherwise one captured JD becomes two jobs in rolecraft's archive.
      const output = formatForRolecraft([
        jd({ rawText: `Responsibilities:\n${JOB_SEPARATOR}\nMore text.` }),
      ]);

      expect(splitAsRolecraftWould(output)).toHaveLength(1);
      expect(output).toContain('NEW JOB');
    });

    it('defuses a separator padded with spaces', () => {
      const output = formatForRolecraft([
        jd({ rawText: `Before\n   ${JOB_SEPARATOR}  \nAfter` }),
      ]);

      expect(splitAsRolecraftWould(output)).toHaveLength(1);
    });

    it('still splits into exactly one segment per job when bodies are hostile', () => {
      const output = formatForRolecraft([
        jd({ id: 'a', rawText: `First\n${JOB_SEPARATOR}\nbody` }),
        jd({ id: 'b', rawText: `Second\n${JOB_SEPARATOR}\nbody` }),
      ]);

      expect(splitAsRolecraftWould(output)).toHaveLength(2);
    });

    it('normalises CRLF line endings', () => {
      const output = formatForRolecraft([jd({ rawText: 'Line one.\r\nLine two.' })]);

      expect(output).not.toContain('\r');
      expect(output).toContain('Line one.\nLine two.');
    });

    it('trims surrounding whitespace from the body', () => {
      const output = formatForRolecraft([jd({ rawText: '\n\n  Body.  \n\n\n' })]);

      expect(output.endsWith('Body.')).toBe(true);
      expect(output).toContain('Captured: 2026-08-10\n\nBody.');
    });

    it('omits the body block entirely when the description is empty', () => {
      const output = formatForRolecraft([jd({ rawText: '   \n  ' })]);

      expect(output).toBe(
        [
          '## Software Engineer, Platform — Stripe',
          'Source: https://linkedin.com/jobs/view/4123456789',
          'Captured: 2026-08-10',
        ].join('\n'),
      );
    });

    it('keeps blank lines inside the body, which carry paragraph structure', () => {
      const output = formatForRolecraft([jd({ rawText: 'Para one.\n\nPara two.' })]);

      expect(output).toContain('Para one.\n\nPara two.');
    });

    it('flattens a newline smuggled into a metadata field', () => {
      // A stray newline in the title would push the rest of the header into the
      // body, where rolecraft would read it as description text.
      const output = formatForRolecraft([
        jd({ title: 'Staff Engineer\nSource: https://evil.example', location: 'A\nB' }),
      ]);

      expect(output.split('\n')[0]).toBe(
        '## Staff Engineer Source: https://evil.example — Stripe',
      );
      expect(output).toContain('Location: A B\n');
    });
  });

  describe('purity', () => {
    it('does not mutate its input', () => {
      const input = [jd({ location: 'Remote', rawText: '  padded  ' })];
      const snapshot = structuredClone(input);

      formatForRolecraft(input);

      expect(input).toEqual(snapshot);
    });

    it('returns the same output for the same input', () => {
      const input = [jd({ id: 'a' }), jd({ id: 'b' })];

      expect(formatForRolecraft(input)).toBe(formatForRolecraft(input));
    });
  });
});
