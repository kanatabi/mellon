/**
 * flash.svelte.ts — the portal's momentary notifications (the snackbar
 * round, 2026-11-22). ONE module, ONE snackbar instance (mounted in the
 * app layout); any page/component fires `flash()` and the snackbar picks
 * it up. The momentary feedback (the export confirmations, the metadata
 * saves, the failures) — NOT the persistent statuses (the autosave pill
 * has its own contract and its own home in the meta bar).
 *
 * The kind = 'ok' | 'danger': the ok = the quiet confirmation; the danger
 * = the destructive/destructive-adjacent failure, styled destructive and
 * announced as role="alert". The auto-dismiss = 3s (a snackbar, not a
 * modal — nothing blocks); a fresh flash replaces the standing one and
 * restarts the timer.
 */

let current = $state<{ kind: 'ok' | 'danger'; text: string } | null>(null);
let timer: ReturnType<typeof setTimeout>;

export function flash(kind: 'ok' | 'danger', text: string, ms = 3000): void {
	current = { kind, text };
	clearTimeout(timer);
	timer = setTimeout(() => (current = null), ms);
}

export function dismissFlash(): void {
	clearTimeout(timer);
	current = null;
}

/** The read-only view for the Snackbar component (runes-mode: a plain
 *  export would lose reactivity — the getter keeps it). */
export const flashState = {
	get current() {
		return current;
	}
};
