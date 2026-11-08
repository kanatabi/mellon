// markdown-it-task-lists is untyped CJS (no @types package on npm) — minimal shim.
declare module 'markdown-it-task-lists' {
	import type MarkdownIt from 'markdown-it';

	export interface TaskListsOptions {
		/** Render enabled (interactive) checkboxes. Default false. */
		enabled?: boolean;
		label?: boolean;
		labelAfter?: boolean;
	}

	export default function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;
}

// markdown-it-container ships no type declarations — minimal shim.
declare module 'markdown-it-container' {
	import type MarkdownIt from 'markdown-it';
	import type { Renderer, Token } from 'markdown-it';

	export interface ContainerOptions {
		validate?(params: string): boolean;
		render?(
			tokens: Token[],
			idx: number,
			options: unknown,
			env: unknown,
			self: Renderer
		): string | void;
	}

	export default function container(md: MarkdownIt, name: string, options?: ContainerOptions): void;
}
