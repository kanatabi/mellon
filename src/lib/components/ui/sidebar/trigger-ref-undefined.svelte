<!-- The BROKEN pattern (S2 round, observed live): an undefined-initialized
		$state bound to a $bindable-with-fallback throws `props_invalid_value`
		at hydration — and because the throw lands inside the error-boundary
		render, the client router falls back to the ROOT boundary and the
		error page loses the shell. This fixture exists so the test suite
		pins the trap. -->
<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';

	let ref = $state<HTMLButtonElement | undefined>();
</script>

<Sidebar.Provider>
	<Sidebar.Trigger bind:ref>x</Sidebar.Trigger>
</Sidebar.Provider>
