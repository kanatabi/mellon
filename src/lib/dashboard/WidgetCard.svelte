<script lang="ts">
	import { GripVertical, Eye, EyeOff } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The widget card — the shared SHELL of the dashboard home: title,
	 * drag handle (the grid-reorder action reads it), pin/unpin (hidden
	 * toggle), and the widget's own body slots in. Knows nothing about
	 * widget content — bodies are self-contained components.
	 */
	interface Props {
		def: WidgetDef;
		hidden: boolean;
		onToggleHidden: () => void;
		/** The body snippet — the widget's own component, rendered by the
		 *  page (which owns the registry lookup). */
		children: Snippet;
	}

	let { def, hidden, onToggleHidden, children }: Props = $props();
</script>

<article
	data-widget={def.id}
	draggable="true"
	class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
	aria-label="{def.title} widget"
>
	<header class="flex items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-1.5">
			<GripVertical
				class="size-3.5 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
				aria-hidden="true"
			/>
			<p class="truncate text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
				{def.title}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if def.href}
				<a
					href={def.href}
					class="rounded-sm font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
				>
					see all →
				</a>
			{/if}
			<button
				type="button"
				onclick={onToggleHidden}
				aria-pressed={!hidden}
				aria-label={hidden ? `Pin ${def.title}` : `Unpin ${def.title}`}
				title={hidden ? 'Pin to dashboard' : 'Unpin (moves to the tray)'}
				class="rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
			>
				{#if hidden}
					<Eye class="size-3.5" />
				{:else}
					<EyeOff class="size-3.5" />
				{/if}
			</button>
		</div>
	</header>
	{#if !hidden}
		<div class="min-w-0">{@render children()}</div>
	{/if}
</article>
