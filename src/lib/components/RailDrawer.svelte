<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { focusOnMount } from '#lib/actions.ts';

	interface Props {
		/** Accessible name for the sheet and its close control. */
		label: string;
		/** Sheet visibility — the CONSUMER owns the trigger button (in-page
		 *  chrome band), not this component. Owner call 2026-11-08: the old
		 *  floating FAB occluded the editor status bar; triggers occupy
		 *  layout, they don't hover over it. */
		open?: boolean;
		/** Focus return target — bound to the consumer's trigger button. */
		trigger?: HTMLElement;
		children: Snippet;
	}

	let {
		label,
		open = $bindable(false),
		trigger = $bindable<HTMLElement>(),
		children
	}: Props = $props();

	// Ported from earendil rail/RailDrawer (2026-11-08), minus the floating
	// trigger: modal sheet at the bottom edge, grab-band drag-to-dismiss
	// (1:1 down, rubber-band up, fling velocity decides), Esc/backdrop/X,
	// close on navigation, reduced-motion gated.
	const reduced = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
	const slideOpts = $derived({ axis: 'y' as const, duration: reduced ? 0 : 240, easing: cubicOut });
	const fadeOpts = $derived({ duration: reduced ? 0 : 150 });

	let panel = $state<HTMLElement | undefined>();

	let dragging = false;
	let startY = 0;
	let lastY = 0;
	let lastT = 0;
	let velocity = 0;

	function onDragStart(e: PointerEvent) {
		if (!panel) return;
		dragging = true;
		startY = lastY = e.clientY;
		lastT = e.timeStamp;
		velocity = 0;
		panel.style.transition = 'none';
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDragMove(e: PointerEvent) {
		if (!dragging || !panel) return;
		const dt = e.timeStamp - lastT;
		if (dt > 0) velocity = (e.clientY - lastY) / dt;
		lastY = e.clientY;
		lastT = e.timeStamp;
		const dy = e.clientY - startY;
		panel.style.transform = `translateY(${dy >= 0 ? dy : dy * 0.15}px)`;
	}

	function onDragEnd(e: PointerEvent) {
		if (!dragging || !panel) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		const dy = Math.max(0, e.clientY - startY);
		const threshold = Math.min(140, panel.offsetHeight * 0.4);
		const fling = velocity > 0.45 && dy > 24;
		if (dy > threshold || fling) {
			if (reduced) {
				close();
				return;
			}
			panel.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
			panel.style.transform = 'translateY(100%)';
			const done = (ev: TransitionEvent) => {
				if (ev.propertyName !== 'transform') return;
				panel?.removeEventListener('transitionend', done);
				close();
			};
			panel.addEventListener('transitionend', done);
		} else {
			panel.style.transition = reduced ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
			panel.style.transform = 'translateY(0px)';
		}
	}

	function close() {
		open = false;
		trigger?.focus(); // same return contract as the palette
	}

	// Navigation closes the sheet; Esc closes it while open.
	$effect(() => {
		void page.url.pathname;
		open = false;
	});
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-30 bg-background/60 backdrop-blur-[2px]"
		role="presentation"
		aria-hidden="true"
		transition:fade={fadeOpts}
		onclick={() => close()}
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		bind:this={panel}
		use:focusOnMount
		class="fixed inset-x-0 bottom-0 z-30 max-h-[80svh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-card p-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl outline-none"
		transition:slide|local={slideOpts}
	>
		<!-- Grab band: the handle plus a generous hit area, pointer-owned.
		     aria-hidden — gesture surface, not a control; dismissal already has
		     X/Esc and keyboard paths. -->
		<div
			class="-mx-5 -mt-3 mb-3 cursor-grab touch-none px-5 pt-3 pb-3 active:cursor-grabbing"
			aria-hidden="true"
			onpointerdown={onDragStart}
			onpointermove={onDragMove}
			onpointerup={onDragEnd}
			onpointercancel={onDragEnd}
		>
			<div class="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden="true"></div>
		</div>
		<button
			type="button"
			onclick={close}
			aria-label="Close {label.toLowerCase()}"
			class="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
		>
			<X class="size-4" />
		</button>
		<div class="flex flex-col gap-5 pr-2">
			{@render children()}
		</div>
	</div>
{/if}
