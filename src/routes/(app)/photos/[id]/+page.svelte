<script lang="ts">
	import {
		ChevronRight,
		Download,
		Eye,
		EyeOff,
		Info,
		Link,
		PanelRightClose,
		PanelRightOpen,
		Trash2
	} from 'lucide-svelte';
	import { beforeNavigate, goto, invalidate } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import Combobox from '#lib/components/Combobox.svelte';
	import DeleteDialog from '#lib/components/DeleteDialog.svelte';
	import RailDrawer from '#lib/components/RailDrawer.svelte';
	import { client } from '#lib/api/client.ts';
	import type { CollectionCount } from '#lib/api/types.ts';
	import { photoRail } from '#lib/rails.svelte.ts';
	import { editField, stateToggle, vocabSubmenu } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import type { Command } from '#lib/commands.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	$effect(() => photoRail.init());

	/* ── Dirty-state form (owner call): metadata is a FORM with explicit save,
	   not auto-patched fields. Draft starts from the server copy; the baseline
	   re-arms on each successful PATCH. Both live HERE, not in the sheet/rail —
	   hiding the pane never hides the edits. */
	// svelte-ignore state_referenced_locally
	let draft = $state({
		alt: data.photo.alt,
		collection: data.photo.collection,
		gallery: data.photo.gallery
	});
	// svelte-ignore state_referenced_locally
	let baseline = $state({ ...draft });
	// palette photo→photo navigation reuses this component: re-baseline when
	// the server photo identity changes (never clobber mid-edit on revalidation
	// of the SAME photo)
	// The initial capture is the point: only later identity changes re-baseline.
	// svelte-ignore state_referenced_locally
	let lastId = $state(data.photo.id);
	$effect(() => {
		const p = data.photo;
		if (p.id === lastId) return;
		lastId = p.id;
		draft = { alt: p.alt, collection: p.collection, gallery: p.gallery };
		baseline = { ...draft };
	});

	const dirtyAlt = $derived(draft.alt !== baseline.alt);
	const dirtyCollection = $derived(draft.collection !== baseline.collection);
	const dirtyGallery = $derived(draft.gallery !== baseline.gallery);
	const dirty = $derived(dirtyAlt || dirtyCollection || dirtyGallery);

	let saving = $state(false);
	let saved = $state(false);
	let failed = $state('');
	let message = $state('');

	// Unsaved-changes guards, lifted from PostEditor: the browser prompt on
	// close/reload, and a confirm on SPA navigation (beforeunload doesn't fire
	// there). guardOff is the deliberate-exit latch (delete → goto).
	let guardOff = $state(false);
	$effect(() => {
		if (!dirty) return;
		const block = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', block);
		return () => window.removeEventListener('beforeunload', block);
	});
	beforeNavigate(({ cancel }) => {
		if (dirty && !guardOff && !confirm('Discard unsaved metadata changes?')) cancel();
	});

	async function save() {
		if (!dirty || saving) return;
		saving = true;
		failed = '';
		try {
			await client.updatePhoto(data.photo.id, {
				alt: draft.alt,
				collection: draft.collection,
				gallery: draft.gallery
			});
			baseline = { ...draft };
			saved = true;
			setTimeout(() => (saved = false), 2500);
			// server facts (and the collections' counts) refresh underneath the
			// now-clean form; the draft/baseline survive because re-baselining
			// is gated on photo IDENTITY above
			void invalidate((url) => url.pathname === `/photos/${data.photo.id}`);
		} catch (e) {
			// keep the edits — a failed save never silently reverts the form
			failed = e instanceof Error ? e.message : 'save failed';
		}
		saving = false;
	}

	// ⌘S like the editor — one keystroke grammar for "commit this form"
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				void save();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	/* ── Page-context palette commands (control-center round 2): the whole
	   metadata pane is ⌘K-reachable. Every commit writes the DRAFT — the
	   palette reaches the form, never around it: persistence stays the
	   explicit Save-changes (⌘S), dirty marks light up exactly as typing
	   does. Built with the command kit: the same shapes as the editor, the
	   same behavior on every page. ──────────────────────────────────────── */
	// Eager vocabulary ride (the Combobox contract, palette edition): a just-
	// created collection lists its own row before any reload.
	let createdCollections = $state<CollectionCount[]>([]);
	$effect(() => {
		const vocab = [
			...data.collections,
			...createdCollections.filter((c) => !data.collections.some((d) => d.name === c.name))
		];
		const cmds: Command[] = [
			{
				id: 'photo.save',
				title: 'Save image metadata',
				group: 'actions',
				shortcut: dirty ? '⌘S' : 'saved',
				run: () => void save()
			},
			editField({
				id: 'photo.alt',
				title: 'Set alt text',
				pill: 'alt',
				seed: draft.alt,
				commit: (v) => {
					draft.alt = v;
				}
			}),
			vocabSubmenu({
				id: 'photo.collection',
				title: 'Set collection',
				// single-home vocabulary: picking SETS, 'uncategorized' clears
				vocab: [
					{ name: 'uncategorized' },
					...vocab.map((c) => ({
						name: c.name,
						hint: `${c.photos} ${c.photos === 1 ? 'photo' : 'photos'}`
					}))
				],
				isOn: (n) => draft.collection === (n === 'uncategorized' ? null : n),
				pick: (n) => {
					draft.collection = n === 'uncategorized' ? null : n;
				},
				create: (raw) => {
					const q = raw.trim().toLowerCase();
					if (!q || q === 'uncategorized') return null;
					const name = slugify(q);
					if (!name || vocab.some((c) => c.name === name)) return null;
					return { name, start: () => client.createCollection(name) };
				},
				onCreated: (name) => {
					createdCollections = [...createdCollections, { name, photos: 0 }];
					draft.collection = name;
				}
			}),
			stateToggle({
				id: 'photo.gallery',
				title: 'Toggle gallery',
				on: draft.gallery,
				onHint: 'in gallery',
				offHint: 'hidden',
				keepOpen: true, // form edit: flip, verify, chain into Save — one session
				run: () => {
					draft.gallery = !draft.gallery;
				}
			}),
			{ id: 'photo.link', title: 'Copy link', group: 'actions', run: () => void copyLink() },
			{
				id: 'photo.download',
				title: 'Download image',
				group: 'actions',
				run: () => void download()
			},
			{
				id: 'photo.delete',
				title: 'Delete image…',
				group: 'actions',
				run: () => (confirmDelete = true)
			}
		];
		setPageCommands(cmds);
		return () => setPageCommands([]);
		// reads draft fields for seeds/hints — re-registers as they change;
		// dirty keeps the ⌘S hint honest (save-vs-saved in the hint column)
	});

	/* ── Download: blob save-as when we may (same-origin; CORS-friendly
	   cross-origin), plain tab as the honest fallback. ─────────────────────── */
	const slugify = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48);
	async function download() {
		const abs = new URL(data.photo.src, location.origin);
		try {
			const res = await fetch(abs.href);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			const ext =
				/\.([a-z0-9]{2,5})$/i.exec(abs.pathname)?.[1] ??
				blob.type.split('/')[1]?.replace(/^jpeg$/, 'jpg') ??
				'jpg';
			const name = `${slugify(draft.alt) || data.photo.id}.${ext.toLowerCase()}`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 30_000);
		} catch {
			// CORS said no (the CDN may allow it later; the mock is same-origin
			// so this path is Phase B's) — the browser can still serve it as a page
			window.open(abs.href, '_blank', 'noopener');
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(new URL(data.photo.src, location.origin).href);
			message = 'link copied';
		} catch {
			message = 'clipboard blocked by the browser';
		}
		setTimeout(() => (message = ''), 2500);
	}

	/* ── Delete: warn loudly, allow anyway. The dialog carries the list of
	   citing posts; the page already shows it (USED IN), so nothing is hidden
	   behind the button. ──────────────────────────────────────────────────── */
	let confirmDelete = $state(false);
	const nRefs = $derived(data.references.length);
	const deleteDescription = $derived(
		nRefs
			? `Removing this image takes it out of the library for good. The file itself keeps being served until storage garbage collection — but ${nRefs} ${nRefs === 1 ? 'post' : 'posts'} embed${nRefs === 1 ? 's' : ''} it and will show a broken picture afterwards:`
			: 'Removing this image takes it out of the library for good. The file itself keeps being served until storage garbage collection. No post embeds this one.'
	);
	async function remove() {
		await client.deletePhoto(data.photo.id);
		guardOff = true; // deliberate exit — the dirty guard must not strand the escape
		await goto('/photos');
	}

	/* ── Rail (lg+ curtain) vs sheet (<lg) — one snippet serves both ──────── */
	let detailsSheet = $state(false);
	let sheetTrigger = $state<HTMLElement | undefined>();
	const fmtDate = (iso: string) =>
		new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(iso)
		);
</script>

<svelte:head>
	<title>{data.photo.alt || data.photo.id} · photos · mellon</title>
</svelte:head>

<section class="flex h-full min-h-0 gap-4">
	<div class="flex min-w-0 grow flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
		<!-- Breadcrumb: the way home, both hops keyboard-reachable. -->
		<nav
			class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
			aria-label="Breadcrumb"
		>
			<a href="/photos" class="transition-colors hover:text-foreground">photos</a>
			<ChevronRight class="size-3" />
			<span class="text-foreground select-all">{data.photo.id}</span>
			<!-- Details key (below lg): the pane lives in a sheet there. -->
			<button
				type="button"
				bind:this={sheetTrigger}
				onclick={() => (detailsSheet = true)}
				aria-haspopup="dialog"
				aria-expanded={detailsSheet}
				class="ml-auto flex h-9 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98] lg:hidden"
				aria-label="Open details"
				title="Details"
			>
				<Info class="size-4" />
			</button>
		</nav>

		<!-- Preview canvas: permanently dark so a white photo still reads —
		     a lightbox backdrop, not a theme surface (layout.css). -->
		<div
			class="photo-canvas flex min-h-[45vh] flex-1 items-center justify-center overflow-hidden rounded-xl border border-border p-4"
		>
			<img
				src={data.photo.src}
				alt={draft.alt}
				width={data.photo.width}
				height={data.photo.height}
				class="max-h-[calc(100svh-9rem)] max-w-full object-contain"
			/>
		</div>

		{#if message}
			<p
				class="w-fit rounded-full bg-brand/10 px-3 py-1 font-mono text-xs text-brand"
				role="status"
			>
				{message}
			</p>
		{/if}
	</div>

	<!-- Metadata pane (lg+): the established curtain — w-80 ↔ w-9 strip,
	     200ms width, persisted via photoRail. Body is ONE snippet also riding
	     the mobile sheet. -->
	<div
		class="hidden shrink-0 self-start overflow-hidden transition-[width] duration-200 ease-out lg:block {photoRail.collapsed
			? 'w-9'
			: 'w-80'}"
	>
		{#if photoRail.collapsed}
			<button
				type="button"
				onclick={photoRail.toggle}
				aria-label="Open details"
				class="flex w-9 flex-col items-center gap-3 rounded-lg border border-border bg-card py-3 text-muted-foreground transition-colors hover:text-foreground"
			>
				<PanelRightOpen class="size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase [writing-mode:vertical-rl]">
					details{#if dirty}
						· edit{/if}
				</span>
			</button>
		{:else}
			<aside
				transition:fade={{ duration: 120 }}
				class="flex max-h-[calc(100svh-7rem)] w-80 flex-col rounded-lg border border-border bg-card"
				aria-label="Photo details"
			>
				<div class="flex items-center justify-between px-4 pt-4 pb-2">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">
						metadata
					</p>
					<button
						type="button"
						onclick={photoRail.toggle}
						aria-label="Collapse details"
						class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<PanelRightClose class="size-4" />
					</button>
				</div>
				<div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
					{@render paneBody(true)}
				</div>
			</aside>
		{/if}
	</div>
</section>

<!-- Sheet (<lg): same body, dirty state stays in the page — closing the
     sheet hides the UI, never the edits. -->
<RailDrawer label="Photo details" bind:open={detailsSheet} bind:trigger={sheetTrigger}>
	{#if dirty}
		<!-- the band scrolls with the sheet body; the badge keeps save/delete
		     visible even when the pane is off-screen mid-scroll -->
		<p class="font-mono text-[10px] text-brand" role="status">unsaved changes</p>
	{/if}
	{@render paneBody(false)}
</RailDrawer>

{#snippet paneBody(rail: boolean)}
	<div class="flex flex-col gap-5 pt-1">
		<label class="flex flex-col gap-1.5">
			<span
				class="flex items-center gap-1.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
			>
				{#if dirtyAlt}
					<span class="size-1.5 rounded-full bg-brand" title="unsaved"></span>
				{/if}
				alt text
			</span>
			<textarea
				rows="2"
				class="resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm transition-colors outline-none focus-visible:border-brand"
				bind:value={draft.alt}
				placeholder="describe the image for readers and search…"></textarea>
		</label>

		<div class="flex flex-col gap-1.5">
			<span
				class="flex items-center gap-1.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
			>
				{#if dirtyCollection}
					<span class="size-1.5 rounded-full bg-brand" title="unsaved"></span>
				{/if}
				collection
			</span>
			<Combobox
				items={data.collections.map((c) => ({ name: c.name, count: c.photos }))}
				multiple={false}
				selected={draft.collection ? [draft.collection] : []}
				emptyLabel="uncategorized"
				noneLabel="uncategorized"
				create={(n) => client.createCollection(n)}
				onchange={(next) => (draft.collection = next[0] ?? null)}
			/>
		</div>

		<div class="flex items-start justify-between gap-4">
			<span class="flex flex-col gap-1">
				<span
					class="flex items-center gap-1.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>
					{#if dirtyGallery}
						<span class="size-1.5 rounded-full bg-brand" title="unsaved"></span>
					{/if}
					public gallery
				</span>
				<span class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
					shown on the blog's Gallery page
				</span>
			</span>
			<!-- teal: photos' wayfinding hue, switch grammar -->
			<button
				type="button"
				role="switch"
				aria-checked={draft.gallery}
				aria-label="Public gallery"
				onclick={() => (draft.gallery = !draft.gallery)}
				class="relative h-6 w-11 shrink-0 rounded-full border transition-colors {draft.gallery
					? 'border-accent-teal bg-accent-teal/25'
					: 'border-border bg-muted/40'}"
			>
				<span
					class="absolute top-0.5 left-0.5 size-5 rounded-full transition-transform {draft.gallery
						? 'translate-x-5 bg-accent-teal'
						: 'translate-x-0 bg-background'} border border-border/60"
				></span>
			</button>
		</div>

		<div class="border-t border-border/70 pt-4">
			<p class="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
				used in · {nRefs}
			</p>
			{#if nRefs}
				<ul class="flex flex-col gap-1.5">
					{#each data.references as ref (ref.slug)}
						<li>
							<a
								href="/posts/{ref.slug}"
								class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
							>
								<ChevronRight class="size-3.5 shrink-0 text-brand" />
								<span class="min-w-0 truncate">{ref.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="font-mono text-[10px] text-muted-foreground/70">no post embeds this image</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
			<span>{data.photo.width}×{data.photo.height} · created {fmtDate(data.photo.createdAt)}</span>
			<span class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={() => void copyLink()}
					aria-label="Copy link"
					title="Copy link"
					class="shrink-0 rounded border border-border p-1 transition-colors hover:text-foreground"
				>
					<Link class="size-3" />
				</button>
				<span class="min-w-0 truncate select-all" title={data.photo.src}>{data.photo.src}</span>
			</span>
			{#if failed}
				<p class="text-danger" role="alert">{failed}</p>
			{/if}
		</div>
	</div>

	<!-- Action band: pinned at the bottom of whichever surface hosts the pane. -->
	<div
		class="mt-5 flex flex-col gap-2 border-t border-border/70 pt-4 {rail
			? 'sticky bottom-0 bg-card'
			: ''}"
	>
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => void save()}
				disabled={!dirty || saving}
				class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
			>
				{saving ? 'saving…' : 'Save changes'}
			</button>
			{#if saved}
				<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 180 }}>
					saved
				</p>
			{/if}
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => void download()}
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
			>
				<Download class="size-3.5" /> Download image
			</button>
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="flex items-center gap-1.5 rounded-full border border-danger/40 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger active:scale-[0.98]"
			>
				<Trash2 class="size-3.5" /> Delete image
			</button>
		</div>
		<!-- gallery semantics echo (rail only, quiet) -->
		{#if rail}
			<p class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
				{#if draft.gallery}<Eye class="size-3" />{:else}<EyeOff class="size-3" />{/if}
				{draft.gallery ? 'in the public gallery' : 'not published to the gallery'}
			</p>
		{/if}
	</div>
{/snippet}

{#if confirmDelete}
	<DeleteDialog
		heading="Delete this image?"
		description={deleteDescription}
		confirmText={data.photo.id}
		confirmLabel="confirm photo id"
		submitText="Delete this image"
		references={data.references}
		onConfirm={remove}
		onClose={() => (confirmDelete = false)}
	/>
{/if}
