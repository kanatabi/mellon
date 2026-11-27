<script lang="ts">
	// The rename door for a custom theme (the theming round 2): the stored
	// JSON's name changes; the id (and therefore the cookie) stays — a
	// rename never breaks the theme a browser is wearing.
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';

	interface Props {
		current: string;
		onSave: (name: string) => void;
		onClose: () => void;
	}

	let { current, onSave, onClose }: Props = $props();

	let open = $state(true);
	// the dialog remounts per open (the house already-open pattern), so the
	// initial prop IS the honest seed
	// svelte-ignore state_referenced_locally
	let name = $state(current);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const next = name.trim();
		if (!next) return;
		onSave(next);
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) onClose();
	}}
>
	<Dialog.Content class="max-w-sm rounded-lg border-0 bg-card p-5 shadow-2xl">
		<Dialog.Header>
			<Dialog.Title class="text-lg font-semibold">Rename theme</Dialog.Title>
		</Dialog.Header>
		<form
			class="flex flex-col gap-3 pt-1"
			onsubmit={(e) => {
				submit(e);
			}}
		>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
					>name</span
				>
				<Input bind:value={name} />
			</label>
			<Dialog.Footer>
				<Button type="button" variant="quiet" onclick={onClose}>Cancel</Button>
				<Button type="submit" variant="primary">Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
