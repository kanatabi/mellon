import { describe, expect, it } from 'vitest';
import { relativeTime } from './time.ts';

const now = Date.parse('2026-11-27T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('relativeTime', () => {
	it('collapses under a minute (and clock skew) to just now', () => {
		expect(relativeTime(ago(10_000), now)).toBe('just now');
		expect(relativeTime(ago(-30_000), now)).toBe('just now');
	});

	it('counts minutes, hours and days', () => {
		expect(relativeTime(ago(5 * 60_000), now)).toBe('5m ago');
		expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3h ago');
		expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d ago');
	});

	it('falls back to a short date past a week', () => {
		expect(relativeTime(ago(10 * 86_400_000), now)).toMatch(/^\w{3} \d{1,2}$/);
	});

	it('renders empty for an unparseable stamp', () => {
		expect(relativeTime('not a date', now)).toBe('');
	});
});
