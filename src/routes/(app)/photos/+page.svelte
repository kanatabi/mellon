<script lang="ts">
	import { Images, Plus } from 'lucide-svelte';
	import ImagePicker from '#lib/components/ImagePicker.svelte';
	import Watermark from '#lib/components/Watermark.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed-once: uploads prepend to the local list; a full reload re-reads
	// the server truth.
	// svelte-ignore state_referenced_locally
	let photos = $state(data.photos);
	// Uploads go through the SHARED picker (owner call: one upload path in
	// the portal) — this page is just its 'upload' mode.
	let pickerOpen = $state(false);
</script>

<svelte:head>
	<title>photos · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Photos</h1>
		<button
			type="button"
			onclick={() => (pickerOpen = true)}
			class="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground active:scale-[0.98]"
		>
			<Plus class="size-4" /> upload
		</button>
	</div>

	{#if photos.length === 0}
		<div class="relative flex flex-col items-center gap-3 py-24">
			<Watermark
				class="pointer-events-none absolute inset-0 m-auto aspect-square w-72"
				opacity={0.08}
			/>
			<Images class="relative size-6 text-muted-foreground" />
			<p class="relative font-mono text-xs text-muted-foreground">
				no photographs yet — the darkroom is empty
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 md:grid-cols-3">
			{#each photos as p (p.id)}
				<figure class="flex flex-col gap-2">
					<img
						src={p.src}
						alt={p.alt}
						width={p.width}
						height={p.height}
						class="aspect-[4/3] w-full rounded-lg border border-border object-cover"
					/>
					<figcaption class="font-mono text-[10px] leading-relaxed text-muted-foreground">
						{p.width}×{p.height} · {p.alt}
					</figcaption>
				</figure>
			{/each}
		</div>
	{/if}
</section>

{#if pickerOpen}
	<ImagePicker
		mode="upload"
		{photos}
		onClose={() => (pickerOpen = false)}
		onUploaded={(p) => (photos = [p, ...photos])}
	/>
{/if}
