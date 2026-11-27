<script lang="ts">
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// The EDITOR section (the settings master/detail split): the vim toggle
	// owns its route AND its action — reset:false matters (SvelteKit resets
	// form elements after a successful action by default; that reset, NOT
	// the cookie, is what made the vim toggle snap back unchecked right
	// after saving).
	let saved = $state(false);
</script>

<svelte:head>
	<title>Editor · settings · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<SubCrumb href="/settings" label="settings">
		<span>editor</span>
	</SubCrumb>
	<h1 class="font-brand text-2xl font-semibold tracking-tight">Editor</h1>

	<form
		method="POST"
		action="?/vim"
		class="flex flex-col gap-4"
		use:enhance={() => {
			saved = false;
			return async ({ update }) => {
				await update({ reset: false });
				saved = true;
				setTimeout(() => (saved = false), 2500);
			};
		}}
	>
		<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
			keybindings
		</p>
		<label
			class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
		>
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Vim keybindings</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					modal editing in the post editor (normal/insert), desktop viewports only — auto-off below
					lg, where touch editing gets plain mode. IME note: pause vim if you type with an input
					method
				</span>
			</span>
			<input
				type="checkbox"
				name="vim"
				value="1"
				checked={data.vim}
				class="mt-1 size-4 shrink-0 accent-brand"
			/>
		</label>
		<div class="flex items-center gap-3">
			<button
				type="submit"
				class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand/90 active:scale-[0.98]"
			>
				Save
			</button>
			{#if saved}
				<span class="font-mono text-xs text-brand" role="status">saved</span>
			{/if}
		</div>
	</form>
</section>
