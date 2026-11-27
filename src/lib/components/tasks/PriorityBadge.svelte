<script lang="ts">
	import type { TaskPriority } from '#lib/api/types.ts';

	interface Props {
		priority: TaskPriority;
		/** `sm` is the list row, `md` the drawer's summary. */
		size?: 'sm' | 'md';
	}

	let { priority, size = 'sm' }: Props = $props();

	// The same three hues the dashboard's priority dot wears (one palette
	// across the app surface): urgent = danger, medium = amber, low = teal.
	// `none` is the absence of a signal, so it draws nothing at all.
	const tone: Record<TaskPriority, string> = {
		high: 'border-danger/50 bg-danger/10 text-danger',
		medium: 'border-accent-amber/60 bg-accent-amber/10 text-accent-amber',
		low: 'border-accent-teal/50 bg-accent-teal/10 text-accent-teal',
		none: ''
	};
</script>

{#if priority !== 'none'}
	<span
		class="inline-flex w-fit items-center rounded-sm border font-mono tracking-wider uppercase {tone[
			priority
		]} {size === 'sm' ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'}"
	>
		{priority}
	</span>
{/if}
