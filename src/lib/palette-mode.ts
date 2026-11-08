/**
 * Palette mode grammar (owner call, 2026-11-08) — the sigil half of ⌘K,
 * as PURE logic: `>` commands · `/` content · `#` pages, prefix + space at
 * position 0 arms a mode and the two characters are consumed from the input
 * (the pill renders; the raw glyph never lingers). Mid-string sigils are
 * literal ("C++ > foo" still searches). A module this small earns its file
 * by being testable in node — Palette.svelte owns only pixels and state.
 * `insert` is the odd one out: NO SIGIL — a task mode armed only through a
 * command's declarative `arm` field (photo rows land at the editor's
 * cursor); `escapeAction` is the unwind precedence of the mode/submenu stack.
 */

export type PaletteMode = 'all' | 'commands' | 'content' | 'pages' | 'insert';

/** Command groups (mirrors commands.ts — kept literal to avoid a cycle). */
type Group = 'actions' | 'go to' | 'open recent' | 'posts' | 'photos' | 'tags';

const PREFIXES: Record<string, PaletteMode> = { '>': 'commands', '/': 'content', '#': 'pages' };

export const MODE_LABEL: Record<PaletteMode, string> = {
	all: '',
	commands: 'commands',
	content: 'content',
	pages: 'pages',
	insert: 'insert'
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
		case 'insert':
			// the editor's task mode: photos ONLY, and their rows insert at
			// the cursor — intent declared through the grammar, never inferred
			return group === 'photos';
	}
}

/** Only these modes ask the API "what matches?" — commands/pages are
 *  portal-side routing; insert rides the same content door as `/`. */
export function usesApi(mode: PaletteMode): boolean {
	return mode === 'all' || mode === 'content' || mode === 'insert';
}

export type EscapeStep = 'disarm' | 'close-submenu' | 'close';

/**
 * Esc unwinds ONE layer of the stack: insert-mode → (back to) submenu →
 * palette. Sigil modes (`> / #`) are typed grammar, not a task path walked
 * into — Esc closes straight through them, the pre-submenu behavior.
 */
export function escapeAction(s: { mode: PaletteMode; inSubmenu: boolean }): EscapeStep {
	if (s.mode === 'insert') return 'disarm';
	if (s.inSubmenu) return 'close-submenu';
	return 'close';
}
