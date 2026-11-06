const PHT_OFFSET = 8 * 60 * 60 * 1000;
export const REBOOT_DAY = 2; // 0=Sun ... 2=Tue
export const REBOOT_HOUR = 6;
export const WINDOW_HOURS = 8;
export const EXTENSION_HOURS = 4;
export const REBOOT_NOTE = `+${EXTENSION_HOURS}h Brownout Extension`;
const DAY = 24 * 60 * 60 * 1000;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type RebootWindow = { start: number; end: number };

/** Weekly reboot window in PHT. Philippines has no DST. */
export function rebootWindow(now: number): RebootWindow {
  const pht = new Date(now + PHT_OFFSET);
  const daysUntil = (REBOOT_DAY - pht.getUTCDay() + 7) % 7;

  let start =
    Date.UTC(
      pht.getUTCFullYear(),
      pht.getUTCMonth(),
      pht.getUTCDate() + daysUntil,
      REBOOT_HOUR,
    ) - PHT_OFFSET;
  let end = start + WINDOW_HOURS * 60 * 60 * 1000;

  if (now >= end) {
    start += 7 * DAY;
    end += 7 * DAY;
  }

  return { start, end };
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}h : ${pad(Math.floor((total % 3600) / 60))}m : ${pad(total % 60)}s`;
}

/** Human-readable schedule label, e.g. "Every Tue 06:00 ~ 14:00 PHT (+4h Brownout Extension)". */
export function rebootScheduleLabel(): string {
  const endHour = REBOOT_HOUR + WINDOW_HOURS;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Every ${DAY_NAMES[REBOOT_DAY]} ${pad(REBOOT_HOUR)}:00 ~ ${pad(endHour)}:00 PHT (${REBOOT_NOTE})`;
}

/** Format the next reboot start as a PHT date, e.g. "Tue, 10 Nov 2026". */
export function nextRebootDateLabel(now: number = Date.now()): string {
  const { start } = rebootWindow(now);
  return new Date(start).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
