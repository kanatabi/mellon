<script lang="ts">
	import { Label as LabelPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		// the house mono metadata label — the 12× span anatomy
		// (`text-xs font-medium tracking-widest text-muted-foreground uppercase`),
		// for standalone labels; wrapper labels keep their layout classes at
		// the call site (a Label must never nest a Label — invalid HTML)
		mono = false,
		...restProps
	}: LabelPrimitive.RootProps & { mono?: boolean } = $props();
</script>

<LabelPrimitive.Root
	bind:ref
	data-slot="label"
	class={cn(
		'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
		mono && 'text-xs font-medium tracking-widest text-muted-foreground uppercase',
		className
	)}
	{...restProps}
/>
