<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// svelte-ignore state_referenced_locally
	let vim = $state(data.vim);
	let saved = $state(false);

	// No resync effect needed: with reset:false the checkbox already carries
	// what the action wrote — the refreshed load can only echo it.
</script>

<svelte:head>
	<title>settings · mellon</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6 py-4">
	<h1 class="font-brand text-4xl font-semibold tracking-tight">Settings</h1>
	<form
		method="POST"
		class="flex flex-col gap-6"
		use:enhance={() => {
			saved = false;
			return async ({ update }) => {
				// reset:false — SvelteKit resets form elements after a successful
				// action by default; that reset, NOT the cookie, is what made the
				// vim toggle snap back unchecked right after saving.
				await update({ reset: false });
				saved = true;
				setTimeout(() => (saved = false), 2500);
			};
		}}
	>
		<label
			class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
		>
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Vim keybindings</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					modal editing in the post editor (normal/insert). IME note: pause vim if you type with an
					input method
				</span>
			</span>
			<input
				type="checkbox"
				name="vim"
				value="1"
				class="mt-1 size-5 accent-[var(--brand)]"
				bind:checked={vim}
			/>
		</label>
		<div class="flex items-center gap-3">
			<button
				type="submit"
				class="w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
			>
				save
			</button>
			{#if saved}
				<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 180 }}>
					saved
				</p>
			{/if}
		</div>
	</form>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		theme follows the toggle in the top bar and survives reloads via the theme cookie; session
		length is set by lumen (Phase B) — today a 12h mock
	</p>
</section>
