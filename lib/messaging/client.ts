import { browser } from 'wxt/browser';
import type { Recruiter } from '../models/types.js';
import type { StorageUsage } from '../storage/SyncProvider.js';
import type { ImportSummary } from '../background/RecruiterStore.js';
import type { Request, Response } from '../background/messages.js';

export interface RecruiterListing {
  recruiters: Recruiter[];
  overflowedIds: string[];
}

/**
 * Typed access to the background worker.
 *
 * An interface rather than bare `sendMessage` calls so the popup can be tested
 * without an extension runtime — and so no UI component ever learns that
 * `chrome.storage.sync` exists.
 */
export interface RecruiterClient {
  list(): Promise<RecruiterListing>;
  remove(id: string): Promise<void>;
  save(recruiter: unknown): Promise<{ overflowed: boolean }>;
  usage(): Promise<StorageUsage>;
}

/**
 * The bulk operations, kept separate from {@link RecruiterClient} rather than
 * bolted onto it. The popup needs none of them, and a surface that cannot
 * rewrite every record at once is easier to reason about than one that can.
 */
export interface DataClient {
  importRecruiters(recruiters: unknown[]): Promise<ImportSummary>;
  /** Both return how many records changed. */
  renameTag(from: string, to: string): Promise<number>;
  removeTag(tag: string): Promise<number>;
}

async function send(request: Request): Promise<Response> {
  const response = (await browser.runtime.sendMessage(request)) as Response | undefined;

  // An absent response means the worker never answered — it crashed, or was
  // still starting. Left unhandled this surfaces as a confusing
  // "cannot read property of undefined" far from the cause.
  if (!response) throw new Error('The background worker did not respond.');

  return response;
}

function unwrap<T extends Response>(response: Response): T {
  if (!response.ok) throw new Error(response.errors.join('; '));
  return response as T;
}

export const recruiterClient: RecruiterClient & DataClient = {
  async list() {
    const response = unwrap(await send({ type: 'recruiter:list' }));
    const { recruiters, overflowedIds } = response as Extract<
      Response,
      { recruiters: Recruiter[] }
    >;
    return { recruiters, overflowedIds };
  },

  async remove(id) {
    unwrap(await send({ type: 'recruiter:remove', id }));
  },

  async save(recruiter) {
    const response = unwrap(await send({ type: 'recruiter:save', recruiter }));
    return { overflowed: (response as Extract<Response, { overflowed: boolean }>).overflowed };
  },

  async usage() {
    const response = unwrap(await send({ type: 'storage:usage' }));
    return (response as Extract<Response, { usage: StorageUsage }>).usage;
  },

  async importRecruiters(recruiters) {
    const response = unwrap(await send({ type: 'data:import', recruiters }));
    return (response as Extract<Response, { summary: ImportSummary }>).summary;
  },

  async renameTag(from, to) {
    const response = unwrap(await send({ type: 'tag:rename', from, to }));
    return (response as Extract<Response, { changed: number }>).changed;
  },

  async removeTag(tag) {
    const response = unwrap(await send({ type: 'tag:remove', tag }));
    return (response as Extract<Response, { changed: number }>).changed;
  },
};

/** Most recently saved first — the list is a working queue, not an archive. */
export function sortForDisplay(recruiters: Recruiter[]): Recruiter[] {
  return [...recruiters].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
