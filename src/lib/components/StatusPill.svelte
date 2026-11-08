<script lang="ts">
	interface Props {
		status: 'draft' | 'published';
	}

	let { status }: Props = $props();
</script>

<!-- §11.3 status discipline: published = violet-filled, draft = outlined neutral.
     Exactly two states, no other colors. -->
<span
	class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider uppercase {status ===
	'published'
		? 'bg-brand/15 text-brand'
		: 'border border-border text-muted-foreground'}">{status}</span
>
