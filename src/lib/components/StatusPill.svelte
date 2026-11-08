<script lang="ts">
	import type { PostStatus } from '#lib/api/types.ts';

	interface Props {
		status: PostStatus;
	}

	let { status }: Props = $props();
</script>

<!-- §11.3 status discipline: published = violet-filled, draft = outlined
     neutral, unpublished = dashed ("took it off the shelf"). Red stays
     reserved for destructive — retirement is neither. -->
<span
	class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase {status ===
	'published'
		? 'bg-brand/15 text-brand'
		: status === 'draft'
			? 'border border-border text-muted-foreground'
			: 'border border-dashed border-muted-foreground/50 text-muted-foreground/80'}">{status}</span
>
