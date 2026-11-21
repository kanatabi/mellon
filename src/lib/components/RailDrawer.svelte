<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	interface Props {
		/** Accessible name for the sheet and its close control. */
		label: string;
		/** Sheet visibility — the CONSUMER owns the trigger button (in-page
		 *  chrome band), not this component. Owner call 2026-11-08: the old
		 *  floating FAB occluded the editor status bar; triggers occupy
		 *  layout, they don't hover over it. */
		open?: boolean;
		/** Focus return target — accepted for the contract; the block's focus
		 *  scope returns focus to the opener natively on close. */
		trigger?: HTMLElement;
		children: Snippet;
	}

	let {
		label,
		open = $bindable(false),
		trigger = $bindable<HTMLElement>(),
		children
	}: Props = $props();

	// SHADCN-PLAN 5.3: the hand-rolled bottom sheet (drag-to-dismiss with
	// velocity fling, manual Esc/backdrop, slide transitions) rewritten over
	// ui/sheet side=bottom — the block owns the modal semantics, focus scope,
	// and dismissal (Esc / backdrop / the built-in X). The drag gesture is
	// NOT in the plan's preserve list — dismissal is X/Esc/backdrop now
	// (ledgered as the round's one behavior loss; veto-able). The mounts bind
	// `open` + `trigger` exactly as before.
	//
	// Navigation closes the sheet (the filters navigate on pick).
	$effect(() => {
		void page.url.pathname;
		open = false;
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="flex max-h-[80svh] flex-col gap-0 rounded-t-2xl border-t border-border bg-card pt-3"
	>
		<Sheet.Header class="p-0">
			<Sheet.Title class="sr-only">{label}</Sheet.Title>
		</Sheet.Header>
		<!-- the chrome (close button) never scrolls: content flows UNDER the
		     pinned corner control, not past it -->
		<div
			class="min-h-0 grow overflow-y-auto overscroll-contain px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
		>
			<div class="flex flex-col gap-5 pr-2">
				{@render children()}
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
