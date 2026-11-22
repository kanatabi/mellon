/**
 * import-markdown.ts — the Obsidian/Notion → CMS import (owner round
 * 2026-11-22). The owner writes in their editor of choice, exports/picks
 * the `.md`, and this maps it to a new post draft — reviewed in the post
 * editor, never auto-published.
 *
 * THE v1 BOUNDARY (the owner's plan): text imports faithfully; images do
 * not. Obsidian's `![[attachments]]` / the relative image links stay as
 * text (the editor's cue layer flags them visually) — a real import-with-
 * media round needs the media relay's upload path first.
 *
 * THE FRONTMATTER: Obsidian and Notion both export YAML between `---`
 * fences. js-yaml parses it (the robust choice — a hand parser would
 * mis-read quoted values, nested lists, dates). The recognized keys map
 * to the draft; everything else is ignored, never silently invented.
 * NO frontmatter → the title falls back to the first H1 (stripped from
 * the content — the blog renders the title itself; a duplicate H1 would
 * read twice).
 */
import { load as yamlLoad } from 'js-yaml';

export interface ImportedPost {
	title: string;
	content: string;
	date: string;
}

/** Strip one YAML frontmatter block: `---\n...\n---` (the first fence only). */
function splitFrontmatter(md: string): { fm: Record<string, unknown>; body: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
	if (!m) return { fm: {}, body: md };
	let fm: Record<string, unknown> = {};
	try {
		const parsed = yamlLoad(m[1]);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			fm = parsed as Record<string, unknown>;
		}
	} catch {
		// the malformed frontmatter = prose, not a crash — the whole file
		// imports as content (the owner sees it in the editor, fixes it)
		return { fm: {}, body: md };
	}
	return { fm, body: md.slice(m[0].length) };
}

const asString = (v: unknown): string | null =>
	typeof v === 'string' && v.trim() ? v.trim() : null;

/** The ISO date (YYYY-MM-DD) or null — the Obsidian dates ride as strings. */
function asDate(v: unknown): string | null {
	const s = asString(v);
	if (!s) return null;
	const iso = s.slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** The first H1's text + the doc with that line removed. */
function titleFromH1(md: string): { title: string | null; body: string } {
	const m = /^#\s+(.+)\r?\n/.exec(md);
	if (!m) return { title: null, body: md };
	return { title: m[1].trim(), body: md.replace(m[0], '') };
}

/** Map an imported markdown file to a new-post draft. */
export function importMarkdown(md: string): ImportedPost {
	const { fm, body: withFm } = splitFrontmatter(md);
	const { title: h1, body } = titleFromH1(withFm);

	const title = asString(fm.title) ?? h1 ?? 'Imported draft';
	const date = asDate(fm.date) ?? new Date().toISOString().slice(0, 10);

	return { title, content: body.trimStart(), date };
}

/** The file-picker plumbing: one `.md` file → the imported draft. Rejects
 *  with a readable message when nothing usable was selected. */
export async function importMarkdownFile(file: File): Promise<ImportedPost> {
	if (!/\.(md|markdown|txt)$/i.test(file.name)) {
		throw new Error('pick a .md, .markdown or .txt file');
	}
	const text = await file.text();
	if (!text.trim()) throw new Error(`${file.name} is empty`);
	return importMarkdown(text);
}
