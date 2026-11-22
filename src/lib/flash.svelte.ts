/**
 * flash.svelte.ts — the portal's momentary notifications (the snackbar
 * round v2, 2026-11-22). ONE module, ONE snackbar instance (mounted in the
 * app layout); any page/component fires `flash()` and the snackbar picks
 * it up. The momentary feedback (the saves, the exports, the failures) —
 * NOT the persistent statuses (the autosave pill has its own contract and
 * its own home in the meta bar).
 *
 * THE KINDS AND THEIR LIFETIMES (the owner's sticky-danger agreement):
 *   ok    → 5s auto-dismiss — the confirmation reads itself once.
 *   warn  → 5s auto-dismiss — the attention state, not a failure.
 *   danger→ STICKY until dismissed — an error that auto-dissolves while
 *           the reader is in the other pane is a missed failure.
 * A fresh flash replaces the standing one and restarts the timer.
 *
 * `action` = the in-snackbar button for the actionable states (the save
 * conflict's "Review diff" door). The sticky + the action = the natural
 * pair: the user must act, the card must wait.
 */

export interface Flash {
	kind: 'ok' | 'warn' | 'danger';
	title: string;
	description?: string;
	sticky?: boolean;
	action?: { label: string; run: () => void };
}

let current = $state<Flash | null>(null);
let timer: ReturnType<typeof setTimeout>;

function schedule(ms: number) {
	clearTimeout(timer);
	timer = setTimeout(() => (current = null), ms);
}

export function flash(f: Flash): void {
	current = { ...f };
	if (f.sticky || f.kind === 'danger') return; // sticky: only the dismiss/action retires it
	schedule(5000);
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
