import { useEffect, useState } from 'react';

export interface ReminderOptInProps {
  hasScheduled: boolean;
  check: () => Promise<boolean>;
  request: () => Promise<boolean>;
}

/**
 * Offers to turn on reminder notifications, and only once there is something to
 * be reminded about.
 *
 * Asking at install, before anyone has set a follow-up, is how permission
 * prompts get declined out of hand. Asking here means the request arrives with
 * an obvious reason attached.
 */
export function ReminderOptIn({ hasScheduled, check, request }: ReminderOptInProps) {
  const [granted, setGranted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void check().then((result) => {
      if (!cancelled) setGranted(result);
    });
    return () => {
      cancelled = true;
    };
  }, [check]);

  // Nothing scheduled, still checking, or already on: say nothing.
  if (!hasScheduled || granted !== false) return null;

  return (
    <p className="muted opt-in">
      Reminders are off.{' '}
      <button
        type="button"
        className="link"
        onClick={() => void request().then(setGranted)}
      >
        Turn on notifications
      </button>
    </p>
  );
}
