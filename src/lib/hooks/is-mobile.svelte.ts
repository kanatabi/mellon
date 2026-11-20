import { MediaQuery } from 'svelte/reactivity';

// A2 (SHADCN.md §2.1): mellon's rail starts at LG (1024) — below it, the
// topbar's hamburger opens the sheet. The block's default 768 would render
// the desktop rail into a range where mellon shows the drawer, and strand
// the hamburger (toggle with no rail) between 768–1024. One line, the
// whole block's mobile/desktop split follows it.
const MOBILE_BREAKPOINT = 1024;

export class IsMobile extends MediaQuery {
	constructor(breakpoint: number = MOBILE_BREAKPOINT) {
		super(`max-width: ${breakpoint - 1}px`);
	}
}
