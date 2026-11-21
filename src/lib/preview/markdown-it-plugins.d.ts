// The markdown-it plugin family's types — the CJS-era packages ship none
// (the extended-dialect round, 2026-11-21). The plugin contract: one
// function taking the MarkdownIt instance.
import type MarkdownIt from 'markdown-it';

declare module 'markdown-it-footnote' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-attrs' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-deflist' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-mark' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-sub' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-sup' {
	const plugin: (md: MarkdownIt) => void;
	export default plugin;
}
declare module 'markdown-it-emoji' {
	export const full: (md: MarkdownIt) => void;
}
