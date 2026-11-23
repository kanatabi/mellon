import type { ThemeId, ThemeMode, ThemePair } from './theme.ts';
import { availableMode, CORE_TOKENS } from './theme-registry.ts';
import { getCustomTheme } from './custom-themes.svelte.ts';

/**
 * Runtime theme state, shared by the app chrome and the login screen (both
 * render the toggle), the settings page (segment control + theme grid) and
 * the command palette — ONE behavior behind every door. The SSR cookie +
 * pre-paint script own first paint; this store only tracks post-hydration
 * flips (View Transitions cross-fade).
 */
export const themeState = $state({
	theme: 'portal' as ThemeId,
	mode: 'light' as ThemeMode
});

export function syncThemeFromServer(pair: ThemePair) {
	themeState.theme = pair.theme;
	themeState.mode = pair.mode;
}

/** Custom themes ride the SAME seam: their token bodies become INLINE
 *  custom properties on <html> (out-ranking every CSS block in the
 *  cascade); switching back to a built-in REMOVES them, or the last
 *  custom's values would keep overriding every later theme. The
 *  pre-paint script does the same job synchronously for first paint. */
function applyCustomVars() {
	const el = document.documentElement;
	const body = themeState.theme.startsWith('custom-')
		? getCustomTheme(themeState.theme)
		: undefined;
	const tokens = body?.tokens[themeState.mode];
	for (const t of CORE_TOKENS) {
		const v = tokens?.[t];
		if (v) el.style.setProperty(`--${t}`, v);
		else el.style.removeProperty(`--${t}`);
	}
}

/** The single write path: store + both data attributes + cookie + custom
 *  vars, VT-animated. The pair is resolved at CALL time into locals, so
 *  the apply callback reads NOTHING reactive (reads inside a
 *  startViewTransition callback escape tracking, and correctness must not
 *  depend on that escape hatch existing — browsers without VT run apply
 *  synchronously, inside the caller's effect scope). The mode is also
 *  validated against the theme's own modes — a dark-only theme picked
 *  while wearing light lands on its available mode, never an impossible
 *  pair. */
export function setTheme(next: ThemeId, mode?: ThemeMode) {
	const resolvedMode: ThemeMode = availableMode(next, mode ?? themeState.mode);
	const apply = () => {
		themeState.theme = next;
		themeState.mode = resolvedMode;
		document.documentElement.dataset.theme = next;
		document.documentElement.dataset.mode = resolvedMode;
		document.cookie = `theme=${next}-${resolvedMode}; path=/; max-age=31536000; samesite=strict`;
		applyCustomVars();
	};
	if (document.startViewTransition) document.startViewTransition(apply);
	else apply();
}

/** The mode flip within the current theme — the toggle's whole job. */
export function setMode(mode: ThemeMode) {
	setTheme(themeState.theme, mode);
}

export function toggleMode() {
	setMode(themeState.mode === 'dark' ? 'light' : 'dark');
}

/** The editor's revert path: re-derive the STORED theme's vars (customs
 *  re-apply their body; built-ins get their overrides removed), undoing
 *  any draft values painted over them. */
export function reapplyThemeVars() {
	applyCustomVars();
}
