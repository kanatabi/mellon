<script module lang="ts">
	import { DashboardLayoutStore, browserLayoutStorage } from './dashboard.svelte.ts';
	import { WIDGETS } from './widgets/registry.ts';

	/** The store lives at module scope so the test can hold the entries
	 *  REFERENCE across effect runs (identity = "no rewrite"). */
	export const store = new DashboardLayoutStore(WIDGETS, browserLayoutStorage);
</script>

<script lang="ts">
	// WIDGETS is imported by the module script and visible here.

	// The page's EXACT pattern (+page.svelte): an effect whose init WRITES
	// the store's $state. Pre-fix, init read `this.entries` after writing
	// it — the effect depended on its own write and depth-exploded.
	$effect(() => {
		store.init('tester', WIDGETS);
	});
</script>

<p data-testid="count">{store.entries.length}</p>
