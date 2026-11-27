import { describe, expect, it } from 'vitest';
import {
	dueAtFromDate,
	dueDateValue,
	dueLabel,
	expiryLabel,
	fullDateLabel,
	isOverdue
} from './dates.ts';

/** Local constructors keep these assertions timezone-independent: both the
 *  fixtures and the helpers speak the machine's local calendar. */
function localIso(year: number, month: number, day: number, hour = 12): string {
	return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

const NOW = new Date(2026, 10, 27, 12, 0, 0, 0).getTime(); // Fri Nov 27 2026, local noon

describe('dueLabel', () => {
	it('names today, tomorrow and yesterday', () => {
		expect(dueLabel(localIso(2026, 11, 27, 18), NOW)).toBe('today');
		expect(dueLabel(localIso(2026, 11, 28, 9), NOW)).toBe('tomorrow');
		expect(dueLabel(localIso(2026, 11, 26, 9), NOW)).toBe('yesterday');
	});

	it('reads the near past as days ago and the near future as a weekday', () => {
		expect(dueLabel(localIso(2026, 11, 24, 9), NOW)).toBe('3d ago');
		expect(dueLabel(localIso(2026, 11, 30, 9), NOW)).toBe('Mon');
	});

	it('falls back to a short date, adding the year across the boundary', () => {
		expect(dueLabel(localIso(2026, 12, 10, 9), NOW)).toBe('10 Dec');
		expect(dueLabel(localIso(2027, 1, 2, 9), NOW)).toBe('2 Jan 2027');
	});

	it('returns empty for undated and malformed values', () => {
		expect(dueLabel(null, NOW)).toBe('');
		expect(dueLabel('not a date', NOW)).toBe('');
	});
});

describe('isOverdue', () => {
	it('is false for undated, done and today-due tasks', () => {
		expect(isOverdue({ dueAt: null, done: false }, NOW)).toBe(false);
		expect(isOverdue({ dueAt: localIso(2026, 11, 20), done: true }, NOW)).toBe(false);
		expect(isOverdue({ dueAt: localIso(2026, 11, 27, 9), done: false }, NOW)).toBe(false);
	});

	it('is true once the local due day has passed', () => {
		expect(isOverdue({ dueAt: localIso(2026, 11, 26, 23), done: false }, NOW)).toBe(true);
	});

	it('ignores malformed instants', () => {
		expect(isOverdue({ dueAt: 'not a date', done: false }, NOW)).toBe(false);
	});
});

describe('expiryLabel', () => {
	it('reads minutes, hours and days', () => {
		expect(expiryLabel(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBe('expires in 30m');
		expect(expiryLabel(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe('expires in 5h');
		expect(expiryLabel(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toBe('expires in 3d');
	});

	it('falls back to a date beyond a week and names the past honestly', () => {
		expect(expiryLabel(localIso(2026, 12, 10, 9), NOW)).toBe('expires 10 Dec');
		expect(expiryLabel(localIso(2026, 11, 27, 9), NOW)).toBe('expired');
	});
});

describe('the date-field conversions', () => {
	it('round-trips a local date, landing at end of day', () => {
		const iso = dueAtFromDate('2026-11-27');
		expect(iso).not.toBeNull();
		const d = new Date(iso as string);
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(10);
		expect(d.getDate()).toBe(27);
		expect(d.getHours()).toBe(23);
		expect(d.getMinutes()).toBe(59);
		expect(dueDateValue(iso)).toBe('2026-11-27');
	});

	it('maps an instant to its LOCAL calendar date', () => {
		expect(dueDateValue(localIso(2026, 2, 3, 0))).toBe('2026-02-03');
		expect(dueDateValue(null)).toBe('');
		expect(dueDateValue('not a date')).toBe('');
	});

	it('rejects impossible and malformed dates instead of normalizing them', () => {
		expect(dueAtFromDate('2026-02-31')).toBeNull();
		expect(dueAtFromDate('2026-2-3')).toBeNull();
		expect(dueAtFromDate('')).toBeNull();
	});

	it('fullDateLabel renders an instant and is empty on garbage', () => {
		expect(fullDateLabel(localIso(2026, 11, 27, 15))).not.toBe('');
		expect(fullDateLabel(null)).toBe('');
		expect(fullDateLabel('nope')).toBe('');
	});
});
