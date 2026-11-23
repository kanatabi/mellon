import type { CustomTheme } from './custom-theme.ts';
import { validateCustomTheme } from './custom-theme.ts';

/**
 * The custom themes' store (the theming round 2): ONE rune module, the
 * ONLY reader/writer of `mellon.theme.custom.<slug>` keys. Everything is
 * loaded eagerly at client init (the layout's script body) so the grid,
 * the palette and the pre-paint fallback all see the same list; the
 * pre-paint script reads its own copy synchronously (same keys, same
 * shape) — this module is the post-hydration truth.
 */
const KEY_PREFIX = 'mellon.theme.custom.';

export const customThemes = $state<{ items: CustomTheme[] }>({ items: [] });

let initialized = false;

/** Client init — idempotent; a corrupt stored entry is skipped, never fatal. */
export function initCustomThemes() {
	if (initialized || typeof localStorage === 'undefined') return;
	initialized = true;
	const items: CustomTheme[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(KEY_PREFIX)) continue;
		try {
			items.push(validateCustomTheme(JSON.parse(localStorage.getItem(key) ?? 'null')));
		} catch {
			// a broken entry must not take the picker down — skip it
		}
	}
	customThemes.items = items;
}

export function getCustomTheme(id: string): CustomTheme | undefined {
	return customThemes.items.find((t) => t.id === id);
}

export function saveCustomTheme(theme: CustomTheme) {
	localStorage.setItem(KEY_PREFIX + theme.id.slice('custom-'.length), JSON.stringify(theme));
	const i = customThemes.items.findIndex((t) => t.id === theme.id);
	if (i >= 0) customThemes.items[i] = theme;
	else customThemes.items = [...customThemes.items, theme];
}

/** Returns true when the id was ours — the caller decides what the picker
 *  falls back to if the DELETED theme is the active one. */
export function deleteCustomTheme(id: string): boolean {
	localStorage.removeItem(KEY_PREFIX + id.slice('custom-'.length));
	const before = customThemes.items.length;
	customThemes.items = customThemes.items.filter((t) => t.id !== id);
	return customThemes.items.length < before;
}
