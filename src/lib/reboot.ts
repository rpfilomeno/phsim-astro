const PHT_OFFSET = 8 * 60 * 60 * 1000;
const REBOOT_HOUR = 6;
const WINDOW_HOURS = 8;
const DAY = 24 * 60 * 60 * 1000;

export type RebootWindow = { start: number; end: number };

/** Weekly reboot: Tuesday 06:00 PHT, 8-hour window. Philippines has no DST. */
export function rebootWindow(now: number): RebootWindow {
  const pht = new Date(now + PHT_OFFSET);
  const daysUntilTuesday = (2 - pht.getUTCDay() + 7) % 7;

  let start =
    Date.UTC(
      pht.getUTCFullYear(),
      pht.getUTCMonth(),
      pht.getUTCDate() + daysUntilTuesday,
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
