/**
 * regex-cues.ts — the cue layer for the markdown the LEZER GRAMMAR cannot
 * see (owner round 2026-11-21): `==highlight==` (unparsed — no node),
 * footnote refs/defs, definition-list `:` lines, `{#custom-id}` attr braces.
 *
 * THE INVARIANT (test-pinned): the regex layer never decorates inside
 * regions the grammar DID parse — a `==` inside a go fence means comparison,
 * not a component. The syntax tree is the structure's source of truth; the
 * regex only finds what it can't.
 *
 * Cost model (owner question): the scan = the VISIBLE ranges only (a few
 * KB), the patterns = line-anchored + quantifier-simple (no nested
 * quantifiers = no backtracking blowup), the exclusion check = one tree
 * resolve per candidate (O(log n)) — the same cost class as the tree-driven
 * cue layer.
 */
import { syntaxTree } from '@codemirror/language';
import {
	EditorView,
	ViewPlugin,
	Decoration,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import { Range, RangeSet } from '@codemirror/state';

/** A code-family ancestor = the regex cue's exclusion zone. */
function insideCode(view: EditorView, pos: number): boolean {
	const tree = syntaxTree(view.state);
	let cursor = tree.resolveInner(pos, -1);
	while (cursor) {
		if (
			cursor.name === 'FencedCode' ||
			cursor.name === 'CodeBlock' ||
			cursor.name === 'InlineCode' ||
			cursor.name === 'CodeText'
		) {
			return true;
		}
		if (!cursor.parent) break;
		cursor = cursor.parent;
	}
	return false;
}

interface RegexCue {
	/** The regex must be global (the cursor walks). */
	re: RegExp;
	cls: string;
	/** Only match AT a line's start (the line-anchored cues: defs/ids). */
	lineStart?: boolean;
}

const CUES: RegexCue[] = [
	{ re: /==[^=\n]+==/g, cls: 'cm-block-highlight' },
	{ re: /\[\^[^\]\s]+\]/g, cls: 'cm-block-footnote' },
	{ re: /^\[\^[^\]\s]+\]:/g, cls: 'cm-block-footnote', lineStart: true },
	{ re: /^\s*:[^\s]/g, cls: 'cm-line-list', lineStart: true }, // the deflist's definition lines
	{ re: /\{#[^}\s]+\}/g, cls: 'cm-cue-heading' }
];

const matchDeco = (cls: string) => Decoration.mark({ class: cls });

function buildRegexDecorations(view: EditorView): DecorationSet {
	const ranges: Array<Range<Decoration>> = [];
	const text = view.state.doc;
	for (const { from, to } of view.visibleRanges) {
		const lineFrom = text.lineAt(from).number;
		const lineTo = text.lineAt(to).number;
		for (let l = lineFrom; l <= lineTo; l++) {
			const line = text.line(l);
			for (const cue of CUES) {
				if (cue.lineStart) {
					const m = cue.re.exec(line.text);
					if (m && !insideCode(view, line.from + m.index)) {
						ranges.push(
							matchDeco(cue.cls).range(line.from + m.index, line.from + m.index + m[0].length)
						);
					}
				} else {
					cue.re.lastIndex = 0;
					let m: RegExpExecArray | null;
					while ((m = cue.re.exec(line.text))) {
						if (insideCode(view, line.from + m.index)) continue;
						ranges.push(
							matchDeco(cue.cls).range(line.from + m.index, line.from + m.index + m[0].length)
						);
					}
				}
			}
		}
	}
	return RangeSet.of(ranges, true);
}

/** The regex cue layer — composes with the tree-driven markCues. */
export const regexCues = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		tree: unknown;
		constructor(view: EditorView) {
			this.tree = syntaxTree(view.state);
			this.decorations = buildRegexDecorations(view);
		}
		update(u: ViewUpdate) {
			// the same tree-advance contract as markCues (the lazy parse!)
			const tree = syntaxTree(u.state);
			if (u.docChanged || u.viewportChanged || tree !== this.tree) {
				this.tree = tree;
				this.decorations = buildRegexDecorations(u.view);
			}
		}
	},
	{ decorations: (v) => v.decorations }
);
