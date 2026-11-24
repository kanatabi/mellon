<script lang="ts">
	import { onMount } from 'svelte';
	import { client, ApiError } from '#lib/api/client.ts';
	import type { AdminPhoto } from '#lib/api/types.ts';

	/** The recent-photos widget body — self-contained (the plugin seam). */
	let photos = $state<AdminPhoto[] | null>(null);
	let failed = $state('');

	onMount(async () => {
		try {
			const page = await client.listPhotos();
			photos = page.items.slice(0, 8);
		} catch (e) {
			failed = e instanceof ApiError ? e.message : 'could not load photos';
		}
	});

	const galleryShown = $derived((photos ?? []).filter((p) => p.gallery).length);
</script>

{#if photos === null}
	<div class="grid grid-cols-4 gap-2" aria-hidden="true">
		{#each [0, 1, 2, 3] as i (i)}
			<span class="aspect-square animate-pulse rounded-md bg-muted/60"></span>
		{/each}
	</div>
{:else if failed}
	<p class="font-mono text-xs text-danger" role="alert">{failed}</p>
{:else}
	<div class="grid grid-cols-4 gap-2">
		{#each photos as photo (photo.id)}
			<a
				href="/photos/{photo.id}"
				title={photo.alt}
				aria-label={photo.alt}
				class="block overflow-hidden rounded-md border border-border transition-colors hover:border-muted-foreground/60 focus-visible:border-muted-foreground focus-visible:outline-none"
			>
				<img
					src={photo.src}
					alt=""
					width={photo.width}
					height={photo.height}
					loading="lazy"
					class="aspect-square w-full object-cover"
				/>
			</a>
		{:else}
			<p class="col-span-4 py-6 font-mono text-xs text-muted-foreground">No photos yet</p>
		{/each}
	</div>
	<p class="mt-3 font-mono text-[10px] text-muted-foreground/70">
		{photos.length} added recently · {galleryShown} in gallery
	</p>
{/if}
