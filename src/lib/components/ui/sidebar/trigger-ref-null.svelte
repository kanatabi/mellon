<!-- The FIXED pattern: a $bindable-with-fallback must never receive
		`undefined` through a two-way binding — initialize with null. -->
<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';

	let ref = $state<HTMLButtonElement | null>(null);
</script>

<Sidebar.Provider>
	<Sidebar.Trigger bind:ref>x</Sidebar.Trigger>
</Sidebar.Provider>
