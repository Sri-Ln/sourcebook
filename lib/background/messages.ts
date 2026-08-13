import type { Recruiter } from '../models/types.js';
import type { StorageUsage } from '../storage/SyncProvider.js';
import type { ImportSummary, RecruiterStore } from './RecruiterStore.js';

export type Request =
  | { type: 'recruiter:list' }
  | { type: 'recruiter:get'; id: string }
  | { type: 'recruiter:save'; recruiter: unknown }
  | { type: 'recruiter:remove'; id: string }
  | { type: 'storage:usage' }
  // The options page dry-runs the file first, but the records still arrive here
  // as `unknown`: the store is the single writer, and it validates its own input.
  | { type: 'data:import'; recruiters: unknown[] }
  | { type: 'tag:rename'; from: string; to: string }
  | { type: 'tag:remove'; tag: string };

export type Response =
  | { ok: true; recruiters: Recruiter[]; overflowedIds: string[] }
  | { ok: true; recruiter: Recruiter | undefined }
  | { ok: true; overflowed: boolean }
  | { ok: true; usage: StorageUsage }
  | { ok: true; summary: ImportSummary }
  | { ok: true; changed: number }
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Routes a message to the store and always answers with a `Response`.
 *
 * Nothing is allowed to throw across the message boundary. An exception here
 * reaches the caller as an opaque "message port closed before a response was
 * received", which says nothing about what actually went wrong — so failures
 * are converted into data instead.
 */
export async function handleMessage(store: RecruiterStore, message: Request): Promise<Response> {
  try {
    switch (message.type) {
      case 'recruiter:list': {
        const { recruiters, overflowedIds } = await store.list();
        return { ok: true, recruiters, overflowedIds };
      }

      case 'recruiter:get':
        return { ok: true, recruiter: await store.get(message.id) };

      case 'recruiter:save': {
        const result = await store.save(message.recruiter);
        return result.ok ? { ok: true, overflowed: result.overflowed } : result;
      }

      case 'recruiter:remove':
        await store.remove(message.id);
        return { ok: true };

      case 'storage:usage':
        return { ok: true, usage: await store.getUsage() };

      case 'data:import':
        // Answered as a success even when some rows were skipped. A partly
        // successful batch reported as a failure would throw away the count of
        // what did get in, which is the number the user actually needs.
        return { ok: true, summary: await store.importRecruiters(message.recruiters) };

      case 'tag:rename':
        return { ok: true, changed: await store.renameTag(message.from, message.to) };

      case 'tag:remove':
        return { ok: true, changed: await store.removeTag(message.tag) };

      default: {
        // Reached when a newer surface sends a message this build predates —
        // possible in an extension whose parts update together but whose tabs
        // do not reload.
        const unknown = message as { type?: unknown };
        return { ok: false, errors: [`Unknown message type: ${String(unknown.type)}`] };
      }
    }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
