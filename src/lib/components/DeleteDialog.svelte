<script lang="ts">
	import { TriangleAlert } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { focusOnMount } from '#lib/actions.ts';

	interface Props {
		title: string;
		slug: string;
		/** Resolves once the deletion is done; errors may reject. */
		onConfirm: () => Promise<void>;
		onClose: () => void;
	}

	let { title, slug, onConfirm, onClose }: Props = $props();

	// GitHub's pattern, applied to posts (owner call 2026-11-08): destructive
	// actions need MORE than a click — the name retyped is the confirmation.
	let typed = $state('');
	let busy = $state(false);
	let failed = $state('');
	const ready = $derived(typed === slug && !busy);

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !busy) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function submit() {
		if (!ready) return;
		busy = true;
		failed = '';
		try {
			await onConfirm();
		} catch (e) {
			busy = false;
			failed = e instanceof Error ? e.message : 'delete failed';
		}
	}
</script>

<div
	transition:fade={{ duration: 120 }}
	class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget && !busy) onClose();
	}}
>
	<div
		transition:scale={{ duration: 150, start: 0.97 }}
		class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-title"
	>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="mb-3 flex items-start gap-3">
				<TriangleAlert class="mt-0.5 size-5 shrink-0 text-danger" />
				<h2 id="delete-title" class="font-brand text-xl leading-snug font-semibold tracking-tight">
					Delete &ldquo;{title}&rdquo;?
				</h2>
			</div>
			<p class="text-sm leading-relaxed text-muted-foreground">
				This removes the post for good — drafts and published pages alike. To confirm, type the
				complete slug below.
			</p>
			<p
				class="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm select-all"
			>
				{slug}
			</p>
			<label class="mt-3 flex flex-col gap-1.5">
				<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
					confirm slug
				</span>
				<input
					type="text"
					class="rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-danger"
					autocomplete="off"
					spellcheck="false"
					placeholder={slug}
					bind:value={typed}
					disabled={busy}
					use:focusOnMount
				/>
			</label>
			{#if failed}
				<p class="mt-3 font-mono text-xs text-danger" role="alert">{failed}</p>
			{/if}
			<div class="mt-5 flex items-center justify-end gap-2">
				<button
					type="button"
					onclick={onClose}
					disabled={busy}
					class="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!ready}
					class="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
				>
					{busy ? 'Deleting…' : 'Delete this post'}
				</button>
			</div>
		</form>
	</div>
</div>
