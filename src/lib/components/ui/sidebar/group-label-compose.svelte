<!-- The composition pattern that dodges the Svelte 5 clobber: a static
	class after a spread REPLACES the spread's class — compose with
	cn(props.class, …) instead. Pins the fix for the icon-mode labels
	(they lost text-xs/tracking/uppercase AND the fade in the S2 round). -->
<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { cn } from '#lib/utils.js';
</script>

<Sidebar.Provider>
	<Sidebar.Group>
		<Sidebar.GroupLabel class="wanted-from-props">
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={cn(props.class as string | undefined, 'added-by-caller')}
				>
					x
				</button>
			{/snippet}
		</Sidebar.GroupLabel>
	</Sidebar.Group>
</Sidebar.Provider>
