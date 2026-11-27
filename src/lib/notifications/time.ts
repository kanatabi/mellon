/**
 * Relative timestamps for the bell — a client-only surface (the panel
 * mounts on open), so `Date.now` is honest here and no hydration pair is
 * possible. Notification TTL is 30 days, hence the date fallback never
 * needs a year.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return '';
	const minutes = Math.floor(Math.max(0, now - t) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	// The chrome's copy is English ("5m ago"), so the date fallback is too —
	// a locale-aware month would read inconsistently beside it.
	return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
