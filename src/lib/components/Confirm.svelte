<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import Button from '#lib/components/ui/button/button.svelte';

	interface Props {
		/** The question, full — the caller owns the nouns. */
		heading: string;
		/** The honest consequence, in plain words. */
		description?: string;
		/** The verb on the arming control. */
		confirmLabel?: string;
		cancelLabel?: string;
		/** Destructive fills the verb with --danger; default is the violet verb. */
		destructive?: boolean;
		/** Resolves once the choice is Confirm. */
		onConfirm: () => void;
		onClose: () => void;
	}

	let {
		heading,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		destructive = true,
		onConfirm,
		onClose
	}: Props = $props();

	// The house confirm — the NATIVE confirm()'s replacement (D15). The OS
	// dialog cannot be themed (browsers render it, custom copy ignored) — the
	// same class of leak as the native <select> ban: every surface here is
	// themed, the popup included. Mounts already-open (callers conditional-
	// render, the DeleteDialog's pattern); the block owns focus scope +
	// dismissal, busy-aware: a half-run confirm must not be dismissed by a
	// stray key.
	let open = $state(true);
	let busy = $state(false);

	async function confirm() {
		if (busy) return;
		busy = true;
		try {
			onConfirm();
		} finally {
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
		<AlertDialog.Title class="text-xl leading-snug font-semibold tracking-tight">
			{heading}
		</AlertDialog.Title>
		{#if description}
			<AlertDialog.Description class="mt-2 text-sm leading-relaxed text-muted-foreground">
				{description}
			</AlertDialog.Description>
		{/if}
		<div class="mt-5 flex items-center justify-end gap-2">
			<AlertDialog.Cancel
				class="h-auto rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				onclick={(e) => {
					if (busy) e.preventDefault();
				}}
			>
				{cancelLabel}
			</AlertDialog.Cancel>
			<Button
				type="button"
				variant="primary"
				class={destructive ? 'bg-danger' : ''}
				disabled={busy}
				onclick={() => void confirm()}
			>
				{confirmLabel}
			</Button>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>
