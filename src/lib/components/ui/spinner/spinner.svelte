<script lang="ts">
	// Vendored from the shadcn-svelte vega registry, with one local edit: the
	// registry's icon-placeholder shim (an icon-library abstraction this
	// project never installed) is replaced by the project's icon lib,
	// lucide-svelte — LoaderCircle IS the registry's Loader2. Props ride
	// lucide's own IconProps (svelte/elements' `| null` variants don't exist
	// on the icon and poison the spread's type union); Svelte omits
	// `undefined` attributes, so unset color/stroke never clobber currentColor.
	import { LoaderCircle, type IconProps } from 'lucide-svelte';
	import { cn } from '#lib/utils.js';

	let {
		class: className,
		role = 'status',
		color,
		stroke,
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: IconProps = $props();
</script>

<LoaderCircle
	{role}
	aria-label={ariaLabel}
	{color}
	{stroke}
	class={cn('size-4 animate-spin', className)}
	{...restProps}
/>
