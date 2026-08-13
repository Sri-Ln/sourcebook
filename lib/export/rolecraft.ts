import type { JobDescription } from '../models/types.js';

/**
 * The marker rolecraft's `process` mode splits on. It splits on a line
 * containing *exactly* this text, which is what makes every rule below load
 * bearing: the marker must own its line, and no line of a description may ever
 * be mistaken for it.
 */
export const JOB_SEPARATOR = '---NEW JOB---';

/**
 * Between entries, never trailing. A trailing separator would hand rolecraft an
 * empty final segment, which it would archive as a phantom job.
 */
const ENTRY_JOINER = `\n${JOB_SEPARATOR}\n`;

/** A line that is nothing but the marker, allowing for stray padding. */
const SEPARATOR_LINE = /^[^\S\n]*---NEW JOB---[^\S\n]*$/gm;

/**
 * A backslash-escaped marker. It renders identically in Markdown, survives a
 * parser that trims before comparing, and — unlike dropping or rewording the
 * line — keeps the description the user actually captured.
 */
const DEFUSED_SEPARATOR = `\\${JOB_SEPARATOR}`;

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Collapses every run of whitespace, newlines included, to a single space. A
 * newline smuggled into a title or location would push the rest of the header
 * into the body, where rolecraft would read it as description text.
 */
function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** `undefined` for anything that would render as an empty label. */
function optionalField(label: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const text = singleLine(value);
  return text === '' ? undefined : `${label}: ${text}`;
}

/**
 * `capturedAt` is an ISO 8601 UTC timestamp; the export wants the date alone.
 * Sliced rather than passed through `Date`, because a local-time conversion
 * would report a late-evening UTC capture as the previous day. An unrecognised
 * value passes through: formatting is not validation, and a visible oddity
 * beats a confidently wrong date.
 */
function capturedDate(capturedAt: string): string {
  const trimmed = singleLine(capturedAt);
  return ISO_DATE_PREFIX.exec(trimmed)?.[1] ?? trimmed;
}

/**
 * Normalises line endings and neutralises any line that rolecraft would read as
 * a separator. Interior blank lines are kept — they carry the paragraph
 * structure of the posting.
 */
function body(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, '\n')
    .replace(SEPARATOR_LINE, DEFUSED_SEPARATOR)
    .trim();
}

function formatEntry(jd: JobDescription): string {
  const lines = [
    `## ${singleLine(jd.title)} — ${singleLine(jd.company)}`,
    `Source: ${singleLine(jd.url)}`,
    `Captured: ${capturedDate(jd.capturedAt)}`,
    optionalField('Location', jd.location),
    optionalField('Compensation', jd.compensation),
  ].filter((line): line is string => line !== undefined);

  const text = body(jd.rawText);
  // An empty description would otherwise leave a dangling blank line, which
  // becomes a stray blank line before the next separator.
  return text === '' ? lines.join('\n') : `${lines.join('\n')}\n\n${text}`;
}

/**
 * Renders job descriptions as one paste for rolecraft's `process` mode.
 *
 * Pure: no clipboard, no `exportedAt` stamping, no filtering of already
 * exported records. The caller decides what goes in; this decides only how it
 * reads. That is what makes the format exhaustively testable.
 */
export function formatForRolecraft(jds: JobDescription[]): string {
  return jds.map(formatEntry).join(ENTRY_JOINER);
}
