<script lang="ts">
	import { ImagePlus, Link, Upload, X } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { focusOnMount } from '#lib/actions.ts';
	import { ApiError, client } from '#lib/api/client.ts';
	import type { AdminPhoto } from '#lib/api/types.ts';

	interface Props {
		/** thumbnail: single-pick for the post cover. insert: pick/upload into
		 *  the markdown body. upload: the photos page's upload-only mode —
		 *  ONE upload path in the portal (owner call). */
		mode: 'thumbnail' | 'insert' | 'upload' | 'upload-cover';
		photos: AdminPhoto[];
		onClose: () => void;
		/** thumbnail/insert: choose a photo (uploads auto-route through it). */
		onPick?: (photo: AdminPhoto) => void;
		/** upload mode: each finished upload, newest last. */
		onUploaded?: (photo: AdminPhoto) => void;
	}

	let { mode, photos, onClose, onPick, onUploaded }: Props = $props();

	// The upload queue: File → data-URL → client-side dimension probe
	// (the mock-era deviation) → addPhoto. Per-file state is visible;
	// a failed file never sinks the batch.
	type QueueItem = {
		id: number;
		name: string;
		status: 'reading' | 'uploading' | 'done' | 'error';
		detail?: string;
	};
	let queue = $state<QueueItem[]>([]);
	// seed: the dialog remounts per open, so a snapshot of the library is the
	// honest initial grid (fresh uploads prepend from there).
	// svelte-ignore state_referenced_locally
	let grid = $state<AdminPhoto[]>(photos);
	let err = $state('');
	let note = $state('');
	let fileInput = $state<HTMLInputElement | undefined>();
	let qid = 0;
	const probe = (src: string) =>
		new Promise<{ width: number; height: number }>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = reject;
			img.src = src;
		});

	async function handleFiles(fileList: FileList | File[]) {
		err = '';
		const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
		if (!files.length) {
			err = 'no image files there';
			return;
		}
		for (const file of files) {
			const id = ++qid;
			queue = [...queue, { id, name: file.name, status: 'reading' }];
			const settle = (patch: Partial<QueueItem>) =>
				(queue = queue.map((q) => (q.id === id ? { ...q, ...patch } : q)));
			try {
				const dataUrl = await new Promise<string>((res, rej) => {
					const r = new FileReader();
					r.onload = () => res(String(r.result));
					r.onerror = rej;
					r.readAsDataURL(file);
				});
				settle({ status: 'uploading' });
				const { width, height } = await probe(dataUrl);
				const created = await client.addPhoto({ name: file.name, dataUrl, width, height });
				grid = [created, ...grid];
				settle({ status: 'done' });
				if (mode === 'upload' || mode === 'upload-cover') onUploaded?.(created);
				// A single upload answers the dialog's question directly: the
				// thumbnail picks itself; the insert embeds itself. Batches of
				// inserts land in the grid, chosen row-by-row (deterministic
				// cursor order beats a firehose at the cursor).
				else if (mode === 'insert' || (mode === 'thumbnail' && files.length === 1))
					onPick?.(created);
			} catch (e) {
				settle({
					status: 'error',
					detail: e instanceof ApiError ? e.message : 'failed'
				});
			}
		}
	}

	function copyLink(photo: AdminPhoto) {
		const abs = new URL(photo.src, location.origin).href;
		void navigator.clipboard
			.writeText(abs)
			.then(() => (note = 'link copied'))
			.catch(() => (err = 'clipboard blocked by the browser'));
	}

	const busy = $derived(queue.some((q) => q.status === 'reading' || q.status === 'uploading'));
	const title = $derived(
		mode === 'thumbnail'
			? 'Cover image'
			: mode === 'insert'
				? 'Insert image'
				: mode === 'upload-cover'
					? 'Upload cover'
					: 'Upload images'
	);

	// Esc close (never during an upload batch — mid-flight abandonment).
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !busy) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<div
	transition:fade={{ duration: 120 }}
	class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget && !busy) onClose();
	}}
>
	<div
		transition:scale={{ duration: 150, start: 0.97 }}
		class="flex max-h-[85svh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<div class="flex items-center justify-between border-b border-border px-5 py-3.5">
			<h2 class="font-brand text-xl font-semibold tracking-tight">{title}</h2>
			<button
				type="button"
				onclick={onClose}
				disabled={busy}
				aria-label="Close"
				class="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
				use:focusOnMount
			>
				<X class="size-4" />
			</button>
		</div>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
			<!-- Upload zone: drop is a bonus; the labeled file input is the
			     keyboard door (photo-page pattern, same doctrine) — every mode. -->
			<div
				ondragover={(e) => {
					e.preventDefault();
					e.currentTarget.classList.add('border-brand');
				}}
				ondragleave={(e) => e.currentTarget.classList.remove('border-brand')}
				role="group"
				aria-label="Drop images to upload"
				ondrop={(e) => {
					e.preventDefault();
					e.currentTarget.classList.remove('border-brand');
					if (e.dataTransfer?.files.length) void handleFiles(e.dataTransfer.files);
				}}
				class="flex items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-5 transition-colors"
			>
				<Upload class="size-4 text-muted-foreground" />
				<span class="font-mono text-xs text-muted-foreground">Drop images, or</span>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground has-[input:focus-visible]:border-brand has-[input:focus-visible]:text-foreground"
				>
					browse…
					<input
						type="file"
						accept="image/*"
						multiple
						class="sr-only"
						bind:this={fileInput}
						onchange={(e) => {
							const t = e.currentTarget;
							if (t.files?.length) void handleFiles(t.files);
							t.value = '';
						}}
					/>
				</label>
			</div>
			{#if err}
				<p class="font-mono text-xs text-danger" role="alert">{err}</p>
			{/if}
			{#if note}
				<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 150 }}>
					{note}
				</p>
			{/if}

			{#if queue.length}
				<ul class="flex flex-col gap-1" aria-label="Upload queue">
					{#each queue as q (q.id)}
						<li
							class="flex items-center justify-between rounded-md px-2 py-1 font-mono text-[11px]"
						>
							<span class="min-w-0 truncate text-muted-foreground">{q.name}</span>
							<span
								class={q.status === 'error'
									? 'text-danger'
									: q.status === 'done'
										? 'text-brand'
										: 'text-muted-foreground/70'}
							>
								{q.status}{#if q.detail}
									· {q.detail}{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if mode !== 'upload' || grid.length}
				<div class="flex flex-col gap-2">
					<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
						{mode === 'upload' || mode === 'upload-cover' ? 'library (now)' : 'choose one'}
					</p>
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
						{#each grid as p (p.id)}
							<div class="group flex flex-col gap-1.5">
								<button
									type="button"
									onclick={() => onPick?.(p)}
									disabled={busy && mode === 'thumbnail'}
									aria-label="{mode === 'insert' ? 'Insert' : 'Use'} {p.alt}"
									class="overflow-hidden rounded-lg border border-border transition-colors hover:border-brand focus-visible:border-brand"
								>
									<img
										src={p.src}
										alt={p.alt}
										width={p.width}
										height={p.height}
										loading="lazy"
										class="aspect-[4/3] w-full object-cover"
									/>
								</button>
								{#if mode === 'insert'}
									<div class="flex items-center justify-between gap-1">
										<span class="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
											>{p.alt}</span
										>
										<button
											type="button"
											onclick={() => copyLink(p)}
											aria-label="Copy link for {p.alt}"
											class="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
										>
											<Link class="size-3" />
										</button>
										<button
											type="button"
											onclick={() => onPick?.(p)}
											aria-label="Insert {p.alt}"
											class="rounded p-1 text-muted-foreground transition-colors hover:text-brand"
										>
											<ImagePlus class="size-3.5" />
										</button>
									</div>
								{/if}
							</div>
						{:else}
							<p class="col-span-full py-6 text-center font-mono text-xs text-muted-foreground">
								no images yet — drop or browse above
							</p>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if mode === 'upload' || mode === 'upload-cover'}
			<div class="flex justify-end gap-2 border-t border-border px-5 py-3.5">
				<button
					type="button"
					onclick={onClose}
					class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
				>
					Done
				</button>
			</div>
		{/if}
	</div>
</div>
