/**
 * cm-cues.ts — the MARK-CUE layer: the editor's markdown punctuation is
 * chrome (it never publishes), so it carries a per-component color — the
 * at-a-glance map from source to preview. The CONTENT is never decorated:
 * not WYSIWYG by construction; the keyboard flow is untouched.
 *
 * Keyed on the LEZER TREE's node names (+ the PARENT for the flavors a mark
 * shares: `**` vs `*`, `-` vs `1.`). Colors live in the --cue-* token layer
 * (layout.css) — the plugin never hardcodes one; a future theme re-points
 * the tokens and the cues follow.
 *
 * Cost model (owner question, answered): the lezer tree is INCREMENTALLY
 * parsed (only the edited ranges), and this plugin iterates only the
 * VISIBLE ranges' tree — per keystroke ≈ the edited range + the viewport,
 * never a full-document scan.
 */
import { syntaxTree } from '@codemirror/language';
import { RangeSet, type Range } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';

const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });

/** The node→cue mapping — PURE (the dom tests pin every family here).
 *  `parent` disambiguates the marks a grammar shares: `**` vs `*`. */
export function cueFor(name: string, parent?: string): string | null {
	switch (name) {
		case 'HeaderMark':
			return 'cm-cue-heading';
		case 'QuoteMark':
			return 'cm-cue-quote';
		case 'CodeMark':
			return 'cm-cue-code';
		case 'ListMark':
			return 'cm-cue-list';
		case 'TableDelimiter':
			return 'cm-cue-table';
		case 'LinkMark':
			return 'cm-cue-link';
		case 'EmphasisMark':
			if (parent === 'StrongEmphasis') return 'cm-cue-bold';
			if (parent === 'Emphasis') return 'cm-cue-italic';
			return null;
		case 'StrikethroughMark':
			return 'cm-cue-strike';
		default:
			return null; // content stays undecorated — the whole point
	}
}

function buildDecorations(view: EditorView): DecorationSet {
	const ranges: Array<Range<Decoration>> = [];
	const tree = syntaxTree(view.state);
	const doc = view.state.doc;
	// block-cue helper: one LINE decoration per line of a multi-line block
	const lineCues = (name: string, cls: string) => (node: { from: number; to: number }) => {
		const first = doc.lineAt(node.from).number;
		const lastLine = doc.lineAt(node.to);
		// a block ending AT a line start owns the line BEFORE it, not the next
		const last =
			lastLine.from === node.to && node.to > node.from ? lastLine.number - 1 : lastLine.number;
		for (let l = first; l <= last; l++) {
			const lineFrom = doc.line(l).from;
			ranges.push(line(cls).range(lineFrom, lineFrom));
		}
	};
	const blockCues: Record<string, string> = {
		Blockquote: 'cm-line-quote',
		FencedCode: 'cm-line-code',
		CodeBlock: 'cm-line-code'
	};
	for (const { from, to } of view.visibleRanges) {
		tree.iterate({
			from,
			to,
			enter(node) {
				const cls = cueFor(node.name, node.node.parent?.name);
				if (cls) ranges.push(mark(cls).range(node.from, node.to));
				// an image's `!` is its first char — the one glyph that says
				// "embed, not link" at a glance
				if (node.name === 'Image') {
					ranges.push(mark('cm-cue-link cm-cue-bold').range(node.from, node.from + 1));
				}
				const blockCls = blockCues[node.name];
				if (blockCls) lineCues(node.name, blockCls)(node);
			}
		});
	}
	// the ORDERING CONTRACT is CM's own: RangeSet.of(sort=true) sorts by
	// (from, value.startSide) — marks vs line-points at the same position
	// resolved by the library, never by a hand-rolled comparator (which
	// could throw the builder and silently kill the whole plugin)
	return RangeSet.of(ranges, true);
}

export const markCues = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view);
		}
	},
	{ decorations: (v) => v.decorations }
);
