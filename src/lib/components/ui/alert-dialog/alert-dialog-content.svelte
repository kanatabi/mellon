<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '#lib/utils.js';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: 'default' | 'sm';
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			// A2: the dialog-content's own centering line — WITHOUT a transform
			// (inset-0 + margin auto + h-fit): a transformed ancestor becomes
			// the containing block for fixed descendants (the users-dialog
			// round's lesson), and the box is furniture (rounded-lg ceiling).
			'group/alert-dialog-content fixed inset-0 z-50 mx-auto my-auto grid h-fit w-full max-w-[calc(100%_-_2rem)] gap-4 rounded-lg bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-sm',
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
