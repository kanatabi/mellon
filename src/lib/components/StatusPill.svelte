<script lang="ts">
	import type { PostStatus } from '#lib/api/types.ts';

	interface Props {
		status: PostStatus;
	}

	let { status }: Props = $props();
</script>

<!-- §11.3 wayfinding statuses: published = violet (alive), draft = amber
     (warm = unfinished), unpublished = dashed neutral ("took it off the
     shelf"). Three states, three voices — no green/blue soup, red stays
     reserved for destructive: retirement is neither. -->
<span
	class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase {status ===
	'published'
		? 'bg-brand/15 text-brand'
		: status === 'draft'
			? 'border border-accent-amber/60 text-accent-amber'
			: 'border border-dashed border-muted-foreground/50 text-muted-foreground/80'}">{status}</span
>
