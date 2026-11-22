<script lang="ts">
	import { CircleHelp } from 'lucide-svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	/**
	 * SectionHint — the section-level "?" affordance (the owner round
	 * 2026-11-22): the CircleHelp icon beside the section's label; hovering
	 * (or focusing — a tap on touch) opens the kit's Tooltip with the
	 * one-line explanation. THE GRANULARITY: the section-level hint lives
	 * here; the FIELD-level micro-copy (the per-attribute lines) stays
	 * inline under its labels — a "?" per field in one drawer = noise.
	 */
	let { text }: { text: string } = $props();
</script>

<Tooltip.Provider delayDuration={150}>
	<Tooltip.Root>
		<Tooltip.Trigger
			class="rounded-full text-muted-foreground/40 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
			aria-label="What is this section?"
		>
			<CircleHelp class="size-3.5" aria-hidden="true" />
		</Tooltip.Trigger>
		<Tooltip.Content side="right" class="w-60">
			<p class="text-xs leading-relaxed">{text}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
