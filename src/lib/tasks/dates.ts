/**
 * Date reading for the tasks surface — pure and node-tested.
 *
 * The DAY MATH that decides which tasks belong to "My day" is lumen's (the
 * adapters ship X-Client-Timezone). What lives here is display: how a due
 * instant reads in the list, whether it has slipped past its local day (the
 * row's amber cue, matching the card lumen computes), and the conversions a
 * date-only field needs. All calendar arithmetic is LOCAL — the browser's
 * zone is the one the workspace asked lumen to use.
 */
const DAY_MS = 86_400_000;

function instant(iso: string | null): number | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : null;
}

function startOfLocalDay(t: number): number {
	const d = new Date(t);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** `today` / `tomorrow` / `yesterday` / `2d ago` / `mon` / `Nov 28` (with a
 *  year only when the year differs). Empty when the wire has no due date. */
export function dueLabel(iso: string | null, now: number = Date.now()): string {
	const due = instant(iso);
	if (due === null) return '';
	const days = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / DAY_MS);
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days < 0) return `${-days}d ago`;
	if (days < 7) {
		return new Date(due).toLocaleDateString('en-GB', { weekday: 'short' });
	}
	const dueDate = new Date(due);
	const sameYear = dueDate.getFullYear() === new Date(now).getFullYear();
	return dueDate.toLocaleDateString('en-GB', {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' })
	});
}

/** The full instant for titles/tooltips (the drawer's facts block). */
export function fullDateLabel(iso: string | null): string {
	const t = instant(iso);
	if (t === null) return '';
	return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(t);
}

/** The row's overdue cue: an open task whose due local day is behind today's.
 *  Same boundary as lumen's `overdue` card — a task due at 09:00 today is
 *  "due today", not overdue, until the day turns. */
export function isOverdue(
	task: Pick<{ dueAt: string | null; done: boolean }, 'dueAt' | 'done'>,
	now: number = Date.now()
): boolean {
	if (task.done) return false;
	const due = instant(task.dueAt);
	if (due === null) return false;
	return startOfLocalDay(due) < startOfLocalDay(now);
}

/** The pending-invite breadcrumb: `expires in 23h`, `expires Nov 30`, or the
 *  honest `expired` (accept answers 410 and the row is consumed). */
export function expiryLabel(iso: string, now: number = Date.now()): string {
	const t = instant(iso);
	if (t === null) return '';
	const ms = t - now;
	if (ms <= 0) return 'expired';
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	if (minutes < 60) return `expires in ${minutes}m`;
	const hours = Math.ceil(minutes / 60);
	if (hours < 24) return `expires in ${hours}h`;
	const days = Math.ceil(hours / 24);
	if (days < 7) return `expires in ${days}d`;
	return `expires ${new Date(t).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
}

/** A due instant as the local `yyyy-mm-dd` a date picker edits. */
export function dueDateValue(iso: string | null): string {
	const t = instant(iso);
	if (t === null) return '';
	const d = new Date(t);
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${month}-${day}`;
}

/** A date-only field's value as the instant the wire carries. A due day is
 *  the END of that local day (23:59) — choosing "today" must not read as
 *  overdue five minutes later. Invalid/impossible dates are null, never a
 *  silently normalized neighbor. */
export function dueAtFromDate(value: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const d = new Date(year, month - 1, day, 23, 59, 0, 0);
	if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
	return d.toISOString();
}
