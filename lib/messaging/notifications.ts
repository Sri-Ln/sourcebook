import { browser } from 'wxt/browser';

/**
 * `browser.permissions.*` is overloaded with promise and callback forms, and
 * TypeScript resolves to the callback one — which returns `void`. Awaiting and
 * asserting is confined here rather than repeated at each call site.
 */
const REMINDER_PERMISSIONS = { permissions: ['notifications'] } as const;

export async function hasReminderPermission(): Promise<boolean> {
  return (await browser.permissions.contains(
    REMINDER_PERMISSIONS as never,
  )) as unknown as boolean;
}

/**
 * Must be called from a user gesture in an extension page. Chrome silently
 * refuses otherwise, and a silent refusal is indistinguishable from the user
 * declining — so the caller would show the wrong thing.
 */
export async function requestReminderPermission(): Promise<boolean> {
  return (await browser.permissions.request(
    REMINDER_PERMISSIONS as never,
  )) as unknown as boolean;
}
