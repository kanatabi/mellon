<!-- Fixture: the patch effect's real path — the prose div bound and
	painted through patchPreview, exactly as PostEditor wires it. The test
	changes the `html` prop; the effect patches. -->
<script lang="ts">
	import { patchPreview } from './preview/preview-diff.ts';

	let { html = '' }: { html?: string } = $props();
	let proseEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!proseEl || !html) return;
		patchPreview(proseEl, html);
	});
</script>

<div class="prose max-w-none" bind:this={proseEl}></div>
