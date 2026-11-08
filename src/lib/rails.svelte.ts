import { browser } from '$app/env';

/**
 * Collapsible-rail state (DESIGN §11.1): every sidebar — the left nav and the
 * right rails on posts/editor — folds to the side and remembers it. Pure
 * client preference (localStorage, not a cookie): nothing server-side reads
 * it, so it must not ride request state. Initial value is expanded; the real
 * value is adopted on mount before paint-sensitive code runs — a one-frame
 * widening is invisible next to the width transition itself.
 *
 * Lesson (2026-11-08): init/toggle are arrow-bound fields, NOT prototype
 * methods — the markup passes them by reference (`onclick={rail.toggle}`),
 * and a detached method call loses `this` and dies silently behind the click.
 */
class Rail {
	collapsed = $state(false);

	init = () => {
		if (browser) this.collapsed = localStorage.getItem(`mellon.rail.${this.key}`) === '1';
	};

	toggle = () => {
		this.collapsed = !this.collapsed;
		if (browser) localStorage.setItem(`mellon.rail.${this.key}`, this.collapsed ? '1' : '0');
	};

	constructor(private key: string) {}
}

export const navRail = new Rail('nav');
export const postsRail = new Rail('posts');
export const editorRail = new Rail('editor');
