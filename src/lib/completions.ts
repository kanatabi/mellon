/**
 * completions.ts — the editor's completion sources (owner round
 * 2026-11-21, "the editor gets a brain"):
 *
 *  - emojiSource: typing `:` opens the Slack-style emoji menu (1,903 static
 *    shortcodes from markdown-it-emoji's data — no API, the user's call);
 *    the apply inserts the RAW SHORTCODE (Route B: the source is the
 *    artifact; the preview renders it to the unicode live);
 *  - keywordSource: inside a code fence, the language's keywords/stdlib
 *    entry-points complete (the fence's info-string names the language;
 *    the data = static per-language arrays). KEYWORD TIER by design —
 *    not LSP-grade (no servers, no signatures).
 *
 * The CONTEXT GATING: the emoji source is silent inside code fences (the
 * tree check — a `:` in Go means something else); the keyword source is
 * silent outside them.
 */
import { syntaxTree } from '@codemirror/language';
import { getCM } from '@replit/codemirror-vim';
import type {
	Completion,
	CompletionContext,
	CompletionResult,
	CompletionSource
} from '@codemirror/autocomplete';
import emojiData from 'markdown-it-emoji/lib/data/full.mjs';

// the emoji options: precomputed once (static data — 1,903 entries)
const EMOJI_OPTIONS: Completion[] = Object.entries(emojiData).map(([name, char]) => ({
	// the LABEL = the glyph + the name (the readable row); the APPLY = the raw
	// shortcode (Route B: the source keeps the artifact's portable form — the
	// preview renders it to the unicode live)
	label: `${char} :${name}:`,
	apply: `:${name}:`,
	type: 'text',
	boost: name.length <= 5 ? 5 : 0 // the short/common names float up
}));

/** The emoji source: silent inside code regions (the tree-exclusion invariant). */
function insideCode(ctx: CompletionContext): boolean {
	const tree = syntaxTree(ctx.state);
	let cursor = tree.resolveInner(ctx.pos, -1);
	while (cursor) {
		if (
			cursor.name === 'FencedCode' ||
			cursor.name === 'CodeBlock' ||
			cursor.name === 'CodeText' ||
			cursor.name === 'InlineCode'
		) {
			return true;
		}
		if (!cursor.parent) break;
		cursor = cursor.parent;
	}
	return false;
}

export const emojiSource: CompletionSource = (ctx: CompletionContext): CompletionResult | null => {
	// TEMP-DEBUG (the emoji menu's non-appearance — removed after the kill)
	console.log(
		'EMOJI: source called | pos:',
		ctx.pos,
		'| inCode:',
		insideCode(ctx),
		'| options:',
		EMOJI_OPTIONS.length
	);
	if (insideCode(ctx)) return null;
	// THE VIM PARITY: in NORMAL mode `:` is the Ex-command trigger — vim owns
	// it, the menu never fires there. Only INSERT-mode typing (where `:` is a
	// literal character) arms the emoji source.
	if (!ctx.view) return null;
	const cmVim = getCM(ctx.view) as unknown as { state?: { vim?: { mode?: string } } } | null;
	if (cmVim?.state?.vim && cmVim.state.vim.mode !== 'insert') return null;
	const before = ctx.matchBefore(/:[a-z0-9_+-]*$/);
	console.log(
		'EMOJI: matchBefore:',
		JSON.stringify(before && ctx.state.sliceDoc(before.from, before.to))
	);
	if (!before) return null;
	return {
		from: before.from,
		options: EMOJI_OPTIONS,
		validFor: /^:[a-z0-9_+-]*:?$/
	};
};

/** THE KEYWORD DATA — the estate's 11 Shiki languages, curated (the
 *  stdlib entry-points + the control flow; not exhaustive — the keyword
 *  tier, per the ruling). */
export const LANG_KEYWORDS: Record<string, string[]> = {
	go: [
		'func',
		'main()',
		'package',
		'import',
		'type',
		'struct',
		'interface',
		'map[string]string',
		'chan',
		'go ',
		'defer ',
		'range ',
		'if err != nil {',
		'return',
		'var',
		'const',
		'switch',
		'select',
		'fmt.Println()',
		'fmt.Errorf()',
		'errors.New()',
		'context.Background()',
		'context.TODO()',
		'http.HandleFunc(',
		'json.NewDecoder(',
		'sync.WaitGroup'
	],
	rust: [
		'fn ',
		'fn main() {',
		'let ',
		'let mut ',
		'mut ',
		'pub ',
		'struct ',
		'enum ',
		'impl ',
		'trait ',
		'match ',
		'Some(',
		'None',
		'Ok(',
		'Err(',
		'unwrap()',
		'expect()',
		'?',
		'use ',
		'mod ',
		'async ',
		'await ',
		'Box::new(',
		'Vec::new()',
		'String::from(',
		'println!()',
		'format!()'
	],
	python: [
		'def ',
		'class ',
		'import ',
		'from ',
		'async def ',
		'await ',
		'lambda ',
		'return',
		'yield ',
		'with ',
		'as ',
		'try:',
		'except ',
		'finally:',
		'raise ',
		'if __name__ == "__main__":',
		'print()',
		'len()',
		'enumerate()',
		'zip()',
		'range()',
		'dict()',
		'list()',
		'self.',
		'None',
		'True',
		'False'
	],
	javascript: [
		'const ',
		'let ',
		'var ',
		'function ',
		'async ',
		'await ',
		'=> ',
		'class ',
		'extends ',
		'import ',
		'export default ',
		'export const ',
		'try {',
		'catch (',
		'finally {',
		'throw new Error()',
		'console.log()',
		'JSON.stringify()',
		'JSON.parse()',
		'Object.keys()',
		'Object.entries()',
		'Array.from()',
		'map()',
		'filter()',
		'reduce()',
		'Promise.all(',
		'async () => {'
	],
	typescript: [
		'interface ',
		'type ',
		'enum ',
		'implements ',
		'readonly ',
		'private ',
		'public ',
		'protected ',
		'abstract ',
		'as ',
		'satisfies ',
		'Record<string, unknown>',
		'Partial<',
		'Pick<',
		'Omit<',
		'Promise<',
		'unknown',
		'never',
		'satisfies ',
		'export type ',
		'import type '
	],
	bash: [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'echo ',
		'printf ',
		'if [ ',
		'then',
		'else',
		'fi',
		'for ',
		'do',
		'done',
		'while ',
		'case ',
		'esac',
		'local ',
		'export ',
		'source ',
		'grep ',
		'sed ',
		'awk ',
		'kubectl ',
		'curl ',
		'&&',
		'||'
	],
	yaml: [
		'apiVersion: ',
		'kind: ',
		'metadata:',
		'  name: ',
		'spec:',
		'  selector:',
		'  template:',
		'data:',
		'  labels:',
		'  annotations:',
		'containers:',
		'  - name: ',
		'    image: ',
		'    ports:'
	],
	json: ['{}', '[]', 'null', 'true', 'false'],
	dockerfile: [
		'FROM ',
		'RUN ',
		'COPY ',
		'ADD ',
		'WORKDIR ',
		'ENV ',
		'ARG ',
		'EXPOSE ',
		'ENTRYPOINT ',
		'CMD ',
		'USER ',
		'LABEL '
	],
	hcl: [
		'resource "',
		'data "',
		'variable ',
		'output ',
		'module ',
		'provider "',
		'terraform {',
		'required_providers {',
		'for_each ',
		'count ',
		'depends_on '
	],
	clojure: [
		'(def ',
		'(defn ',
		'(let [',
		'(if ',
		'(when ',
		'(map ',
		'(reduce ',
		'(filter ',
		'(fn [',
		'(doseq [',
		'(-> ',
		'(->> ',
		'(require ',
		'(ns '
	]
};

const KW_OPTIONS = new Map<string, Completion[]>();
function keywordOptions(lang: string): Completion[] {
	let opts = KW_OPTIONS.get(lang);
	if (!opts) {
		opts = (LANG_KEYWORDS[lang] ?? []).map((k) => ({ label: k, type: 'keyword' }));
		KW_OPTIONS.set(lang, opts);
	}
	return opts;
}

/** The fence-language keyword source: the info-string names the language. */
export const keywordSource: CompletionSource = (
	ctx: CompletionContext
): CompletionResult | null => {
	const tree = syntaxTree(ctx.state);
	const cursor = tree.resolveInner(ctx.pos, -1);
	// the fence's language = the info string on the FencedCode/CodeBlock head
	let fenceLang: string | null = null;
	let node = cursor;
	while (node) {
		if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
			const info = node.getChild('CodeInfo');
			if (info) fenceLang = ctx.state.sliceDoc(info.from, info.to).trim().split(/\s+/)[0];
			break;
		}
		node = node.parent as typeof node;
	}
	if (!fenceLang) return null;
	const opts = keywordOptions(fenceLang.toLowerCase());
	if (opts.length === 0) return null;
	const word = ctx.matchBefore(/[a-zA-Z_][\w.-]*$/);
	if (!word) return null;
	return { from: word.from, options: opts, validFor: /^[a-zA-Z_][\w.-]*$/ };
};
