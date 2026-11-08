/**
 * Date grammar (DESIGN §7 — control-center round 1), pure and node-testable.
 * The palette's ✎ DATE field buffers feed this; the calendar popover stays
 * the mouse door. RANGES are parsed from day one (the posts/photos filter
 * pages consume them in a later round; the editor's single-date commit
 * rejects from≠to): everything returns a { from, to } window, ISO strings,
 * UTC-stable — never a Date object leaking timezones into drafts.
 *
 * Grammar:
 *   today · tomorrow · yesterday
 *   2026-11-12                              (ISO, passes through)
 *   -3d  +2w  +1m  1m                       (relative offsets, d/w/m units;
 *                                            months clamp to month-end)
 *   nov 12  ·  12 nov                       (current year, honest no-rollover)
 *   monday · next monday                    (next occurrence, 1–7 days out)
 *   this week · last week · next week       (Mon-first windows)
 *   this month · last month · next month
 *   <atom>..<atom>                          (range; endpoints auto-sort)
 */

export interface DateWindow {
	from: string;
	to: string;
}

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Strict ISO parse — the only form trusted verbatim. */
export function fromISO(s: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return null;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
		? d
		: null;
}

const DAY = 86_400_000;

/** Month shift clamping to the last valid day (Jan 31 +1m → Feb 28). */
function addMonths(d: Date, n: number): Date {
	const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
	const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
	return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d.getUTCDate(), last)));
}

export function shiftDate(
	from: string,
	delta: { days?: number; weeks?: number; months?: number }
): string {
	const d = fromISO(from);
	if (!d) return from;
	const shifted = addMonths(
		new Date(d.getTime() + (delta.days ?? 0) * DAY + (delta.weeks ?? 0) * 7 * DAY),
		delta.months ?? 0
	);
	return iso(shifted);
}

export const todayISO = (): string => iso(new Date());

/** Monday-first week bounds containing `d`. */
function weekWindow(d: Date): DateWindow {
	const dow = (d.getUTCDay() + 6) % 7; // Mon=0
	const mon = new Date(d.getTime() - dow * DAY);
	const sun = new Date(mon.getTime() + 6 * DAY);
	return { from: iso(mon), to: iso(sun) };
}

function monthWindow(year: number, month0: number): DateWindow {
	const first = new Date(Date.UTC(year, month0, 1));
	const last = new Date(Date.UTC(year, month0 + 1, 0));
	return { from: iso(first), to: iso(last) };
}

/** Resolve a month name (>=3 letters, prefix-unique) to its index. */
function monthIndex(name: string): number {
	if (name.length < 3) return -1;
	return MONTHS.findIndex((m) => m.startsWith(name));
}

/** Single-instant atoms: dates the grammar accepts outside window words. */
function parseAtom(raw: string, today: Date): Date | null {
	const s = raw.trim();
	if (!s) return null;
	const exact = fromISO(s);
	if (exact) return exact;
	if (s === 'today') return today;
	if (s === 'tomorrow') return new Date(today.getTime() + DAY);
	if (s === 'yesterday') return new Date(today.getTime() - DAY);
	const rel = /^([+-]?)(\d+)([dwm])$/.exec(s);
	if (rel) {
		const n = (rel[1] === '-' ? -1 : 1) * Number.parseInt(rel[2], 10);
		if (rel[3] === 'd') return new Date(today.getTime() + n * DAY);
		if (rel[3] === 'w') return new Date(today.getTime() + n * 7 * DAY);
		return addMonths(today, n);
	}
	const wd = /^next\s+(mon|tues|wednes|thurs|fri|satur|sun)day$/.exec(s);
	const bare = wd ? wd[1] + 'day' : s;
	if (WEEKDAYS.includes(bare)) {
		const target = WEEKDAYS.indexOf(bare);
		const ahead = (target - today.getUTCDay() + 7) % 7;
		return new Date(today.getTime() + (ahead === 0 ? 7 : ahead) * DAY);
	}
	const md = /^([a-z]+)\s+(\d{1,2})$/.exec(s) ?? /^(\d{1,2})\s+([a-z]+)$/.exec(s);
	if (md) {
		const [name, dayStr] = /^[0-9]/.test(s) ? [md[2], md[1]] : [md[1], md[2]];
		const m = monthIndex(name);
		const day = Number.parseInt(dayStr, 10);
		if (m < 0 || day < 1 || day > 31) return null;
		const d = new Date(Date.UTC(today.getUTCFullYear(), m, day));
		// honest no-rollover: current year, even if already past (nov 3 2026
		// seen on dec 15 stays that december — ambiguity is the author's to fix)
		// …but NOT silent day-overflow: nov 31 is not a date, it's a typo
		if (isNaN(d.getTime()) || d.getUTCMonth() !== m || d.getUTCDate() !== day) return null;
		return d;
	}
	return null;
}

export function parseDateExpr(raw: string, now: Date = new Date()): DateWindow | null {
	const s = raw.trim().toLowerCase();
	if (!s) return null;
	// today pinned to UTC midnight so day-arithmetic is timezone-stable
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

	const win = /^(this|last|next)\s+(week|month)$/.exec(s);
	if (win) {
		const shift = win[1] === 'last' ? -1 : win[1] === 'next' ? 1 : 0;
		if (win[2] === 'week') return weekWindow(new Date(today.getTime() + shift * 7 * DAY));
		const m = addMonths(today, shift);
		return monthWindow(m.getUTCFullYear(), m.getUTCMonth());
	}

	const parts = s.split('..');
	if (parts.length > 2) return null;
	const a = parseAtom(parts[0], today);
	if (!a) return null;
	if (parts.length === 1) return { from: iso(a), to: iso(a) };
	const b = parseAtom(parts[1], today);
	if (!b) return null;
	return a <= b ? { from: iso(a), to: iso(b) } : { from: iso(b), to: iso(a) };
}
