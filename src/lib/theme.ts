export type Theme = 'light' | 'dark';

/**
 * The theme contract, shared with earendil: exactly two values, the `theme`
 * cookie is the source of truth, and anything absent/unknown falls back to
 * light. The server load resolves it so the pre-paint script can set
 * data-theme before the first paint — no flash of the wrong palette, ever.
 */
export function resolveTheme(cookieValue: string | undefined): Theme {
	return cookieValue === 'dark' ? 'dark' : 'light';
}
