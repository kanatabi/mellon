<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import Button from '#lib/components/ui/button/button.svelte';

	interface Props {
		heading: string;
		/** Changed attribute NAMES only — the values live on the diff page. */
		changed: string[];
		/** The verb on the arming control ('Save draft' | 'Save Post' | 'Publish'). */
		confirmLabel: string;
		/** False in create mode: nothing is saved yet, so there is nothing to diff against. */
		canDiff?: boolean;
		onConfirm: () => void;
		onCheckDiff: () => void;
		onClose: () => void;
	}

	let {
		heading,
		changed,
		confirmLabel,
		canDiff = true,
		onConfirm,
		onCheckDiff,
		onClose
	}: Props = $props();

	// The save-confirm gate (owner call 2026-11-21): every save/publish with
	// pending changes asks WHAT changed first — names only — and offers the
	// full diff page instead of a blind write. Same busy-aware dismissal as
	// the house Confirm: a half-run confirm must not be stray-keyed away.
	let open = $state(true);
	let busy = $state(false);

	function confirm() {
		if (busy) return;
		busy = true;
		onConfirm();
	}
</script>

<AlertDialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o && !busy) onClose();
	}}
>
	<AlertDialog.Content class="max-w-md rounded-lg border-0 bg-card p-5 shadow-2xl sm:max-w-md">
		<AlertDialog.Title class="font-brand text-xl leading-snug font-semibold tracking-tight">
			{heading}
		</AlertDialog.Title>
		<AlertDialog.Description class="mt-2 text-sm leading-relaxed text-muted-foreground">
			{#if changed.length > 0}
				Changed: <span class="font-mono text-foreground">{changed.join(', ')}</span>
			{:else}
				no changes detected
			{/if}
			{#if !canDiff}
				Nothing is saved yet — there is no head to diff against.
			{/if}
		</AlertDialog.Description>
		<div class="mt-5 flex flex-wrap items-center justify-end gap-2">
			<AlertDialog.Cancel
				class="h-auto rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				onclick={(e) => {
					if (busy) e.preventDefault();
				}}
			>
				Cancel
			</AlertDialog.Cancel>
			{#if canDiff}
				<Button
					type="button"
					variant="quiet"
					disabled={busy}
					onclick={() => {
						if (busy) return;
						busy = true;
						onCheckDiff();
					}}
				>
					Check diff
				</Button>
			{/if}
			<Button type="button" variant="primary" disabled={busy} onclick={() => void confirm()}>
				{confirmLabel}
			</Button>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>
