<script lang="ts">
	import { TriangleAlert } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import { ApiError } from '#lib/api/client.ts';

	interface Props {
		/** Full question, e.g. `Delete "my title"?` — the caller owns the noun. */
		heading: string;
		/** The honest consequence, in plain words (owner call: warn loudly). */
		description: string;
		/** The string retyped to arm the button (post slug, photo id…). */
		confirmText: string;
		confirmLabel?: string;
		submitText?: string;
		/** Things that will break — listed, never blocking (warn-vs-block:
		 *  the choice stays the human's, with full information). */
		references?: { slug: string; title: string }[];
		/** Resolves once the deletion is done; errors may reject. */
		onConfirm: () => Promise<void>;
		onClose: () => void;
	}

	let {
		heading,
		description,
		confirmText,
		confirmLabel = 'confirm slug',
		submitText = 'Delete',
		references,
		onConfirm,
		onClose
	}: Props = $props();

	// SHADCN-PLAN 5.2: the hand-rolled overlay (manual Esc/backdrop wiring,
	// scale transition, manual aria) rewritten over ui/alert-dialog — the
	// block owns the modal semantics, focus scope, and dismissal (Esc and
	// backdrop both route through onOpenChange(false) → onClose; disabled
	// while busy — a half-run delete must not be abandoned by a stray key).
	// The mounts render the component ALREADY-OPEN ({#if confirmDelete}), so
	// open starts true. The TYPE-TO-CONFIRM stays ours: it IS the component's
	// point (GitHub's pattern, owner call 2026-11-08 — destructive actions
	// need more than a click). The destructive grammar holds: --danger, never
	// the violet; no autofocus on the verb — the block's focus scope lands on
	// the typed field first, and that IS the arm.
	let open = $state(true);
	let typed = $state('');
	let busy = $state(false);
	let failed = $state('');
	const ready = $derived(typed === confirmText && !busy);

	async function submit() {
		if (!ready) return;
		busy = true;
		failed = '';
		try {
			await onConfirm();
			onClose();
		} catch (e) {
			failed = e instanceof ApiError ? e.message : 'could not delete';
			busy = false;
		}
	}
</script>

<AlertDialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o && !busy) onClose();
	}}
>
	<AlertDialog.Content class="max-w-md rounded-lg border-0 bg-card p-5 shadow-2xl sm:max-w-md">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="mb-3 flex items-start gap-3">
				<TriangleAlert class="mt-0.5 size-5 shrink-0 text-danger" />
				<AlertDialog.Title class="font-brand text-xl leading-snug font-semibold tracking-tight">
					{heading}
				</AlertDialog.Title>
			</div>
			<AlertDialog.Description class="text-sm leading-relaxed text-muted-foreground">
				{description}
			</AlertDialog.Description>
			{#if references?.length}
				<div class="mt-3">
					<p class="mb-1.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
						used in · {references.length}
					</p>
					<ul
						class="max-h-36 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2"
					>
						{#each references as ref (ref.slug)}
							<li class="truncate py-0.5 text-sm">
								<span class="text-foreground">{ref.title}</span>
								<span class="ml-1.5 font-mono text-[10px] text-muted-foreground">{ref.slug}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<p
				class="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm select-all"
			>
				{confirmText}
			</p>
			<label class="mt-3 flex flex-col gap-1.5">
				<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
					{confirmLabel}
				</span>
				<input
					type="text"
					class="rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-danger"
					autocomplete="off"
					spellcheck="false"
					placeholder={confirmText}
					bind:value={typed}
					disabled={busy}
				/>
			</label>
			{#if failed}
				<p
					class="mt-3 font-mono text-xs text-danger"
					role="alert"
					transition:fade={{ duration: 120 }}
				>
					{failed}
				</p>
			{/if}
			<div class="mt-5 flex items-center justify-end gap-2">
				<AlertDialog.Cancel
					class="h-auto rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
					onclick={(e) => {
						if (busy) e.preventDefault();
					}}
				>
					Cancel
				</AlertDialog.Cancel>
				<Button
					type="submit"
					variant="primary"
					class="bg-danger disabled:opacity-40"
					disabled={!ready}
				>
					{busy ? 'Deleting…' : submitText}
				</Button>
			</div>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
