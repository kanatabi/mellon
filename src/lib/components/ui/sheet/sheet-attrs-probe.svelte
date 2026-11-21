<script lang="ts">
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	let open = $state(true);
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger data-testid="t">open</Sheet.Trigger>
	<Sheet.Content data-testid="c" side="left">
		<div>x</div>
	</Sheet.Content>
</Sheet.Root>
