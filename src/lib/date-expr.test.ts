import { describe, expect, it } from 'vitest';
import { parseDateExpr, shiftDate } from './date-expr.ts';

// fixed clock: Sunday, 8 November 2026 (UTC) — every assertion is TZ-stable
const NOW = new Date(Date.UTC(2026, 10, 8));
const one = (s: string) => {
	const w = parseDateExpr(s, NOW);
	return w && w.from === w.to ? w.from : w;
};

describe('date grammar', () => {
	it('keywords and ISO pass through', () => {
		expect(one('today')).toBe('2026-11-08');
		expect(one('tomorrow')).toBe('2026-11-09');
		expect(one('yesterday')).toBe('2026-11-07');
		expect(one('2026-11-12')).toBe('2026-11-12');
		expect(one('2027-02-30')).toBeNull(); // month/day overflow is not a date
		expect(one('2026-13-01')).toBeNull();
	});

	it('relative offsets in days, weeks, months', () => {
		expect(one('-3d')).toBe('2026-11-05');
		expect(one('+2w')).toBe('2026-11-22');
		expect(one('1m')).toBe('2026-12-08');
		expect(one('-2m')).toBe('2026-09-08');
	});

	it('month-day in either order, current year', () => {
		expect(one('nov 12')).toBe('2026-11-12');
		expect(one('12 november')).toBe('2026-11-12');
		expect(one('may 1')).toBe('2026-05-01'); // may: 3-letter prefix is unique
		expect(one('jun 31')).toBeNull(); // day > month length rejected at parse
		expect(one('foo 12')).toBeNull();
	});

	it('weekdays resolve to the NEXT occurrence (1–7 days out)', () => {
		// NOW is a Sunday
		expect(one('monday')).toBe('2026-11-09');
		expect(one('next sunday')).toBe('2026-11-15'); // today's name means next week
		expect(one('friday')).toBe('2026-11-13');
	});

	it('window words give ranges', () => {
		expect(parseDateExpr('this week', NOW)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
		expect(parseDateExpr('last week', NOW)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
		expect(parseDateExpr('next week', NOW)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
		expect(parseDateExpr('this month', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
		expect(parseDateExpr('last month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
	});

	it('ranges parse both ways and auto-sort', () => {
		expect(parseDateExpr('nov 1..nov 12', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-12' });
		expect(parseDateExpr('nov 12..nov 1', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-12' });
		expect(parseDateExpr('today..+3d', NOW)).toEqual({ from: '2026-11-08', to: '2026-11-11' });
		expect(one('a..b..c')).toBeNull();
	});

	it('garbage is null, never a guess', () => {
		expect(one('')).toBeNull();
		expect(one('someday')).toBeNull();
		expect(one('nov')).toBeNull();
		expect(one('12/26')).toBeNull();
	});

	it('shiftDate: the palette stepper — days/weeks/months, month-end clamp', () => {
		expect(shiftDate('2026-11-08', { days: -1 })).toBe('2026-11-07');
		expect(shiftDate('2026-11-08', { weeks: 1, days: 1 })).toBe('2026-11-16');
		expect(shiftDate('2026-01-31', { months: 1 })).toBe('2026-02-28'); // clamped
		expect(shiftDate('2024-01-31', { months: 1 })).toBe('2024-02-29'); // leap
		expect(shiftDate('not-a-date', { days: 1 })).toBe('not-a-date'); // refuses to corrupt
	});
});
