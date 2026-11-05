import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRemaining, rebootWindow } from './reboot.ts';

const HOUR = 60 * 60 * 1000;
const PHT_OFFSET = 8 * HOUR;

/** Build a PHT wall-clock timestamp (Philippines has no DST). */
const pht = (y: number, m: number, d: number, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h, min) - PHT_OFFSET;

test('Thursday points at the coming Tuesday 06:00 PHT', () => {
  const { start } = rebootWindow(pht(2026, 11, 5, 12));
  assert.equal(start, pht(2026, 11, 10, 6));
});

test('Tuesday before the window counts down to the same day', () => {
  const { start, end } = rebootWindow(pht(2026, 11, 10, 5));
  assert.equal(start, pht(2026, 11, 10, 6));
  assert.equal(end - start, 8 * HOUR);
});

test('Tuesday inside the window keeps the current window', () => {
  const { start, end } = rebootWindow(pht(2026, 11, 10, 7));
  assert.equal(start, pht(2026, 11, 10, 6));
  assert.equal(end, pht(2026, 11, 10, 14));
});

test('Tuesday after the window rolls to next week', () => {
  const { start } = rebootWindow(pht(2026, 11, 10, 15));
  assert.equal(start, pht(2026, 11, 17, 6));
});

test('formatRemaining clamps and pads', () => {
  assert.equal(formatRemaining(-5), '00h : 00m : 00s');
  assert.equal(formatRemaining(3 * HOUR + 2 * 60 * 1000 + 4000), '03h : 02m : 04s');
});
