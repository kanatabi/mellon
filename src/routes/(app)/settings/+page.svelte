<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed; enhance reloads the page.
	// svelte-ignore state_referenced_locally
	let vim = $state(data.vim);
</script>

<svelte:head>
	<title>settings · mellon;</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6 py-4">
	<h1 class="font-brand text-4xl font-semibold tracking-tight">
		Settings<span class="text-brand">;</span>
	</h1>

	<form method="POST" class="flex flex-col gap-6" use:enhance>
		<label
			class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
		>
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Vim keybindings</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					modal editing in the post editor (normal/insert). IME note: pause vim if you type with an
					input method;
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
		<button
			type="submit"
			class="w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			save<span class="text-white/70">;</span>
		</button>
	</form>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		theme follows the toggle in the top bar and survives reloads via the theme cookie; session
		length is set by lumen (Phase B) — today a 12h mock;
	</p>
</section>
