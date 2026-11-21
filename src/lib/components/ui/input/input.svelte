<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList | null } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			// SHADCN-PLAN 3.1: the house line, verbatim (the tree's 10× input
			// anatomy) — bg-card field, mono text, brand border on focus. Width
			// and placeholder color stay at the call site (several sites are not
			// full-width; the verbatim line carries neither).
			'rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			// the house line, verbatim — see the file branch above
			'rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
