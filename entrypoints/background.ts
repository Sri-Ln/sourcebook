import { browser } from 'wxt/browser';
import { RecruiterStore } from '../lib/background/RecruiterStore.js';
import { handleMessage, type Request } from '../lib/background/messages.js';
import {
  NOTIFIED_KEY,
  REMINDER_ALARM,
  msUntilNextMidnight,
  planReminder,
} from '../lib/background/reminders.js';
import { todayIso } from '../lib/recruiters/followUp.js';
import { ChromeSyncProvider } from '../lib/storage/ChromeSyncProvider.js';

export default defineBackground(() => {
  // The single writer. Content scripts and the popup could reach storage
  // directly, but chrome.storage.sync enforces 120 writes per minute and 1,800
  // per hour — limits a burst of saves genuinely reaches. Routing everything
  // through here means one place to serialise, retry, and decide what happens
  // when storage fills up, and no two callers racing on the same quota.
  const store = new RecruiterStore(new ChromeSyncProvider());

  browser.runtime.onMessage.addListener((message) =>
    handleMessage(store, message as Request),
  );

  // Clicking the toolbar icon opens the side panel instead of a popup. The list
  // lives there because it stays open while you browse LinkedIn, which a popup
  // cannot: a popup closes the moment focus leaves it.
  //
  // Chrome-only. Firefox opens its sidebar from the toolbar natively, and the
  // API does not exist there, so this is guarded rather than assumed.
  /**
   * Raises at most one notice per day for everyone whose follow-up has arrived.
   *
   * Silent unless the user has granted notifications, which is deliberate: the
   * side panel's Due filter and per-card badges are the primary surface and
   * need no permission at all. Notifications are the opt-in extra.
   */
  const raiseDueReminder = async () => {
    const allowed = await browser.permissions.contains({ permissions: ['notifications'] });
    if (!allowed) return;

    const [{ recruiters }, stored] = await Promise.all([
      store.list(),
      browser.storage.local.get(NOTIFIED_KEY),
    ]);

    const notice = planReminder(recruiters, stored[NOTIFIED_KEY] as string | undefined);
    if (!notice) return;

    await browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon/128.png',
      title: notice.title,
      message: notice.message,
    });

    await browser.storage.local.set({ [NOTIFIED_KEY]: todayIso() });
  };

  // Anchored to midnight rather than a fixed interval: a follow-up can only
  // become due when the date changes.
  browser.alarms.create(REMINDER_ALARM, {
    when: Date.now() + msUntilNextMidnight(),
    periodInMinutes: 24 * 60,
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMINDER_ALARM) void raiseDueReminder();
  });

  // Dates pass while the browser is closed. Without this check on startup the
  // reminder for those days would simply never happen.
  void raiseDueReminder();

  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Nothing actionable: the panel is still reachable from the extension menu.
    });
});
