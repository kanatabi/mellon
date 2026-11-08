/**
 * Palette mode grammar (owner call, 2026-11-08) — the sigil half of ⌘K,
 * as PURE logic: `>` commands · `/` content · `#` pages, prefix + space at
 * position 0 arms a mode and the two characters are consumed from the input
 * (the pill renders; the raw glyph never lingers). Mid-string sigils are
 * literal ("C++ > foo" still searches). A module this small earns its file
 * by being testable in node — Palette.svelte owns only pixels and state.
 */

export type PaletteMode = 'all' | 'commands' | 'content' | 'pages';

/** Command groups (mirrors commands.ts — kept literal to avoid a cycle). */
type Group = 'actions' | 'go to' | 'open recent' | 'posts' | 'photos' | 'tags';

const PREFIXES: Record<string, PaletteMode> = { '>': 'commands', '/': 'content', '#': 'pages' };

export const MODE_GLYPH: Record<PaletteMode, string> = {
	all: '',
	commands: '❯',
	content: '⌕',
	pages: '#'
};

export const MODE_LABEL: Record<PaletteMode, string> = {
	all: '',
	commands: 'commands',
	content: 'content',
	pages: 'pages'
};

/**
 * If `raw` commits a prefix (`> ` at position 0, trailing space included),
 * return the armed mode + remaining argument; null means the text is a plain
 * query. An empty arg (`> `) still arms — VS Code-style, the mode IS the ask
 * until you type.
 */
export function armMode(raw: string): { mode: PaletteMode; arg: string } | null {
	const head = raw.slice(0, 1);
	if (raw.length >= 2 && raw[1] === ' ' && PREFIXES[head])
		return { mode: PREFIXES[head], arg: raw.slice(2) };
	return null;
}

/** Which command groups a mode shows. */
export function acceptsGroup(mode: PaletteMode, group: Group): boolean {
	switch (mode) {
		case 'all':
			return true;
		case 'commands':
			return group === 'actions';
		case 'content':
			return group === 'posts' || group === 'photos' || group === 'tags';
		case 'pages':
			return group === 'go to' || group === 'open recent';
	}
}

/** Only these modes ask the API "what matches?" — commands/pages are
 *  portal-side routing, the search door stays reserved for content. */
export function usesApi(mode: PaletteMode): boolean {
	return mode === 'all' || mode === 'content';
}
