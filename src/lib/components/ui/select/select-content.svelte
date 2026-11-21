<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '#lib/utils.js';
	import type { WithoutChildrenOrChild } from '#lib/utils.js';
	import SelectPortal from './select-portal.svelte';
	import SelectScrollDownButton from './select-scroll-down-button.svelte';
	import SelectScrollUpButton from './select-scroll-up-button.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		preventScroll = true,
		...restProps
	}: WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
	} = $props();
</script>

<SelectPortal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="select-content"
		class={cn(
			// SHADCN-PLAN 4.2: the house popup — card surface, border (no ring),
			// the soft float, p-1 list padding; the anchor width is the floor
			// (long option lists widen via the call site's min-w override).
			'relative z-50 max-h-(--bits-select-content-available-height) min-w-36 origin-(--bits-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-1 text-foreground shadow-xl duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
			className
		)}
		{...restProps}
	>
		<SelectScrollUpButton />
		<SelectPrimitive.Viewport
			class={cn(
				'h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1'
			)}
		>
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectScrollDownButton />
	</SelectPrimitive.Content>
</SelectPortal>
