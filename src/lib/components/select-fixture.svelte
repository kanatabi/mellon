<script lang="ts">
	import * as Select from '#lib/components/ui/select/index.js';

	interface Props {
		label?: string;
	}
	let { label = 'Testing Project · completed' }: Props = $props();
</script>

<Select.Root type="single" value="p1" items={[{ value: 'p1', label }]}>
	<Select.Trigger aria-label="Project">
		<Select.Value />
	</Select.Trigger>
</Select.Root>
