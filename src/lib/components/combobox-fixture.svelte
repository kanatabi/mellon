<script lang="ts">
	import Combobox from './Combobox.svelte';
	import type { ComboboxRow } from './Combobox.svelte';

	interface Props {
		create?: (name: string) => Promise<ComboboxRow>;
	}

	let { create }: Props = $props();

	let selected = $state<string[]>([]);
</script>

<Combobox
	items={[{ name: 'field-notes', count: 12 }]}
	multiple={false}
	{selected}
	emptyLabel="set collection…"
	{create}
	onchange={(next) => (selected = next)}
/>
