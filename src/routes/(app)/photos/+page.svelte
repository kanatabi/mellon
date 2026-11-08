<script lang="ts">
	import { Images, Plus } from 'lucide-svelte';
	import Watermark from '#lib/components/Watermark.svelte';
	import { client } from '#lib/api/client.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed-once: uploads prepend to the
	// local list; a full reload re-reads the server truth.
	// svelte-ignore state_referenced_locally
	let photos = $state(data.photos);
	let busy = $state(false);
	let message = $state('');
	let files: FileList | null = $state(null);

	const probe = (src: string) =>
		new Promise<{ width: number; height: number }>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = reject;
			img.src = src;
		});

	async function upload() {
		const file = files?.[0];
		if (!file) return;
		busy = true;
		message = '';
		// Mock deviation (journal): data-URL storage + CLIENT dimension probe.
		// lumen's §8 upload does the server-side probe; contract stays identical.
		const src = await new Promise<string>((res, rej) => {
			const r = new FileReader();
			r.onload = () => res(String(r.result));
			r.onerror = rej;
			r.readAsDataURL(file);
		});
		const { width, height } = await probe(src);
		const created = await client.addPhoto({ name: file.name, dataUrl: src, width, height });
		photos = [created, ...photos];
		busy = false;
		message = 'stored;';
	}
</script>

<svelte:head>
	<title>photos · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Photos</h1>
		<label
			class="flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground has-[input:focus-visible]:border-brand has-[input:focus-visible]:text-foreground"
		>
			<Plus class="size-4" /> upload
			<!-- real input stays focusable (keyboard doctrine) -->
			<input
				type="file"
				accept="image/*"
				class="sr-only"
				bind:files
				onchange={() => void upload()}
			/>
		</label>
	</div>
	{#if busy}
		<p class="font-mono text-xs text-muted-foreground">probing dimensions…</p>
	{:else if message}
		<p class="w-fit rounded-full bg-brand/10 px-3 py-1 font-mono text-xs text-brand">{message}</p>
	{/if}

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
