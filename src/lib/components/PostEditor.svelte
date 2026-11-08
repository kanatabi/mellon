<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { Clock, Eye, EyeOff, PanelRightClose, PanelRightOpen } from 'lucide-svelte';
	import { tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import CodeMirrorEditor from '#lib/components/CodeMirrorEditor.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { editorRail } from '#lib/rails.svelte.ts';
	import { markMermaidPending, renderMermaid } from '#lib/mermaid-preview.ts';
	import { themeState } from '#lib/theme-state.svelte.ts';
	import { ApiError, client, preview } from '#lib/api/client.ts';
	import type {
		AdminPhoto,
		PostDraft,
		PostStatus,
		PostDetailAdmin,
		TagCount
	} from '#lib/api/types.ts';
	import { slugify } from '#lib/slug.ts';

	interface Props {
		/** Absent ⇒ create mode: the first save POSTs, then the URL adopts the slug. */
		post?: PostDetailAdmin;
		tags: TagCount[];
		photos: AdminPhoto[];
		vim: boolean;
	}

	let { post, tags, photos, vim }: Props = $props();

	const STARTER = `# Untitled

One paragraph that earns its keep.

\`\`\`mermaid
flowchart LR
    idea --> draft --> publish
\`\`\`
`;

	// seed-once: the editor OWNS its copy after mount (server data is the
	// initial doc; save/publish update the local mirrors below).
	// svelte-ignore state_referenced_locally
	const seed = post;
	let draft = $state<PostDraft>(
		seed
			? {
					slug: seed.slug,
					title: seed.title,
					subtitle: seed.subtitle,
					preview: seed.preview,
					date: seed.date,
					tags: seed.tags,
					content: seed.content,
					thumbnail: seed.thumbnail
				}
			: {
					slug: '',
					title: '',
					subtitle: '',
					preview: '',
					date: new Date().toISOString().slice(0, 10),
					tags: [],
					content: STARTER,
					thumbnail: null
				}
	);
	let isNew = $derived(seed === undefined);
	let rev = $state(seed?.rev ?? 0);
	let status = $state<PostStatus>(seed?.status ?? 'draft');
	let updatedAt = $state(seed?.updatedAt ?? null);
	let publishedAt = $state(seed?.publishedAt ?? null);
	let dirty = $state(false);
	let slugTouched = $state(false);
	let message = $state<{ kind: 'ok' | 'err' | 'conflict'; text: string } | null>(null);
	let showPreview = $state(true);
	let html = $state('');
	let saving = $state(false);

	$effect(() => editorRail.init());

	// item #2: slug auto-derives from the title until the author edits it by
	// hand. Only meaningful pre-create — a shipped slug never changes (URL
	// stability; lumen §8 has no rename verb by design).
	let lastAuto = $state('');
	$effect(() => {
		if (slugTouched || !isNew) return;
		const s = slugify(draft.title);
		if (!draft.slug || draft.slug === lastAuto) {
			draft.slug = s;
			lastAuto = s;
		}
	});

	// Debounced near-real-time preview (server endpoint = the vendored pipeline).
	// 120ms: reads as "while typing" but batches a burst of keystrokes into one
	// render round-trip — the pipeline runs Shiki, not a regex.
	let previewTimer: ReturnType<typeof setTimeout>;
	let previewEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		const md = draft.content;
		if (!showPreview) return;
		clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			try {
				html = (await preview(md)).html;
			} catch {
				html = '<p class="font-mono text-xs text-danger">preview failed</p>';
			}
		}, 120);
		return () => clearTimeout(previewTimer);
	});

	// Mermaid lifecycle per owner call 2026-11-08: EVERY preview swap re-shimmers
	// the fences (typing shows motion, not raw code), and the actual render fires
	// only 450ms after the keystroke burst settles — half-typed blocks never
	// flash an error. Theme flips re-run the same cycle (sources survive in the
	// DOM; earendil's Route B contract).
	let mermaidTimer: ReturnType<typeof setTimeout>;
	function scheduleMermaid(el: HTMLElement) {
		markMermaidPending(el);
		clearTimeout(mermaidTimer);
		mermaidTimer = setTimeout(() => void renderMermaid(el), 450);
	}
	// Reads `html` on purpose: it is the dependency meaning "the pane got new
	// DOM" — and `previewEl` so the first mount hydrates too.
	$effect(() => {
		if (!previewEl || !showPreview || !html) return;
		const el = previewEl;
		void tick().then(() => scheduleMermaid(el));
	});
	$effect(() => {
		void themeState.theme;
		if (!previewEl || !showPreview || !html) return;
		const el = previewEl;
		void tick().then(() => scheduleMermaid(el));
	});

	function touch() {
		dirty = true;
		message = null;
	}

	// Unsaved-changes guards (M4b): the browser prompt on reload/close, and a
	// confirm on SPA navigation (beforeunload does not fire there).
	$effect(() => {
		if (!dirty) return;
		const block = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', block);
		return () => window.removeEventListener('beforeunload', block);
	});
	beforeNavigate(({ cancel }) => {
		if (dirty && !confirm('Discard unsaved changes?')) cancel();
	});

	async function save(): Promise<boolean> {
		saving = true;
		try {
			if (isNew) {
				if (!draft.slug) draft.slug = slugify(draft.title) || 'untitled';
				const created = await client.createPost({ ...draft, title: draft.title || 'Untitled' });
				dirty = false;
				message = { kind: 'ok', text: `created · rev ${created.rev}` };
				await goto(`/posts/${created.slug}`, {
					replace: true,
					reset: false
				});
				return true;
			}
			const res = await client.updatePost(draft.slug, draft, rev);
			rev = res.rev;
			updatedAt = res.updatedAt;
			dirty = false;
			message = { kind: 'ok', text: `saved · rev ${rev}` };
			return true;
		} catch (e) {
			if (e instanceof ApiError && e.status === 412) {
				message = {
					kind: 'conflict',
					text: 'conflict: someone saved first — reload to take theirs'
				};
			} else {
				message = { kind: 'err', text: e instanceof Error ? e.message : 'save failed' };
			}
			return false;
		} finally {
			saving = false;
		}
	}

	/* §4 state machine — the only legal verbs per state:
	   draft → publish · published → unpublish · unpublished → publish. */
	async function publish() {
		if (isNew) {
			// create + publish as ONE intent before adopting the URL, so the
			// remounted page never lands on a half-published draft
			saving = true;
			try {
				if (!draft.slug) draft.slug = slugify(draft.title) || 'untitled';
				const created = await client.createPost({ ...draft, title: draft.title || 'Untitled' });
				const res = await client.publishPost(created.slug);
				dirty = false;
				message = { kind: 'ok', text: 'created · published' };
				await goto(`/posts/${res.slug}`, { replace: true, reset: false });
			} catch (e) {
				message = { kind: 'err', text: e instanceof Error ? e.message : 'publish failed' };
				saving = false;
			}
			return;
		}
		if (!(await save())) return;
		const res = await client.publishPost(draft.slug);
		status = res.status;
		rev = res.rev;
		updatedAt = res.updatedAt;
		publishedAt = res.publishedAt;
		message = { kind: 'ok', text: 'published' };
	}

	async function unpublish() {
		const res = await client.unpublishPost(draft.slug);
		status = res.status;
		rev = res.rev;
		updatedAt = res.updatedAt;
		message = { kind: 'ok', text: 'unpublished — off the shelf' };
	}

	async function remove() {
		if (!confirm('Delete this post for good?')) return;
		dirty = false; // deliberate exit — skip the SPA guard
		await client.deletePost(draft.slug);
		await goto('/posts');
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			void save();
		}
	}

	const toggleTag = (t: string) => {
		draft.tags = draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t];
		touch();
	};

	const fmtDate = new Intl.DateTimeFormat('en-GB', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const fmtDay = (iso: string | null) => (iso ? fmtDate.format(new Date(iso)) : '—');
</script>

<svelte:head>
	<title>{draft.title || 'new post'} · mellon</title>
</svelte:head>

<!-- ⌘/Ctrl+Enter saves — window-scoped (an element handler on a plain
     <section> would trip the a11y non-interactive rule and miss editor keys
     anyway, since CodeMirror stops keydown propagation). -->
<svelte:window onkeydown={onKey} />

<section class="flex min-h-full flex-1 gap-4">
	<div class="flex min-w-0 grow flex-col gap-4">
		<!-- Meta bar: entity title wears the serif; verbs live right. -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-3">
				<h1 class="min-w-0 truncate font-brand text-2xl font-semibold tracking-tight">
					{draft.title || 'New post'}
				</h1>
				{#if !isNew}
					<StatusPill {status} />
				{:else}
					<span class="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase"
						>unsaved</span
					>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => (showPreview = !showPreview)}
					class="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs transition-colors {showPreview
						? 'border-brand bg-brand/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={showPreview}
				>
					{#if showPreview}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
					preview
				</button>
				{#if !isNew}
					<button
						type="button"
						onclick={() => void remove()}
						class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-danger transition-colors hover:bg-danger/10"
					>
						delete
					</button>
				{/if}
				<button
					type="button"
					disabled={saving}
					onclick={() => void save()}
					class="rounded-full border border-border px-4 py-1.5 text-sm transition-all hover:border-muted-foreground active:scale-[0.98] disabled:opacity-40"
				>
					{isNew ? 'create' : 'save draft'}<span class="text-muted-foreground">⏎</span>
				</button>
				{#if status === 'published'}
					<button
						type="button"
						disabled={saving}
						onclick={() => void unpublish()}
						class="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-all hover:text-foreground active:scale-[0.98] disabled:opacity-40"
					>
						unpublish
					</button>
				{:else}
					<button
						type="button"
						disabled={saving}
						onclick={() => void publish()}
						class="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
					>
						publish
					</button>
				{/if}
			</div>
		</div>

		{#if message}
			<p
				transition:slide={{ duration: 180 }}
				class="w-fit rounded-full px-3 py-1 font-mono text-xs {message.kind === 'ok'
					? 'bg-brand/10 text-brand'
					: message.kind === 'conflict'
						? 'bg-accent text-foreground'
						: 'text-danger'}"
				role="status"
			>
				{message.text}
			</p>
		{/if}

		<div class="grid min-h-0 flex-1 gap-4 {showPreview ? 'lg:grid-cols-2' : ''}">
			<div
				class="min-h-[50vh] flex-1 overflow-hidden rounded-lg border border-border bg-card lg:min-h-0"
			>
				<CodeMirrorEditor bind:value={draft.content} onchange={touch} {vim} class="h-full" />
			</div>

			{#if showPreview}
				<!-- NO outro transition here: while fading, the pane is still a grid
				     child — the container has already collapsed to one column, so the
				     ghost reflowed BELOW the editor for its last frames (owner report
				     #5). Immediate removal is the smooth choice. -->
				<div
					bind:this={previewEl}
					class="preview min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-5"
					aria-label="Rendered preview"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-rendered, DOMPurify-sanitized in the pipeline -->
					<div class="prose max-w-none">{@html html}</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Post settings rail — slug/date/tags/thumbnail + the timeline. The
	     container animates its width; the content curtains inside it (item #6). -->
	<div
		class="shrink-0 overflow-hidden transition-[width] duration-200 ease-out {editorRail.collapsed
			? 'w-9'
			: 'w-72'}"
	>
		{#if editorRail.collapsed}
			<button
				type="button"
				onclick={editorRail.toggle}
				aria-label="Open post settings"
				class="flex h-full w-9 flex-col items-center gap-3 rounded-lg border border-border bg-card py-3 text-muted-foreground transition-colors hover:text-foreground"
			>
				<PanelRightOpen class="size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase [writing-mode:vertical-rl]"
					>settings;</span
				>
			</button>
		{:else}
			<aside
				transition:fade={{ duration: 120 }}
				class="flex w-72 flex-col gap-5 self-stretch overflow-y-auto rounded-lg border border-border bg-card p-4"
				aria-label="Post settings"
			>
				<div class="flex items-center justify-between">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">
						settings
					</p>
					<button
						type="button"
						onclick={editorRail.toggle}
						aria-label="Collapse post settings"
						class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<PanelRightClose class="size-4" />
					</button>
				</div>

				<label class="flex flex-col gap-1">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>title</span
					>
					<input
						class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus-visible:border-brand"
						bind:value={draft.title}
						oninput={touch}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>subtitle</span
					>
					<input
						class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus-visible:border-brand"
						bind:value={draft.subtitle}
						oninput={touch}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>slug</span
					>
					{#if isNew}
						<input
							class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs outline-none hover:border-border focus-visible:border-brand"
							placeholder="auto from title;"
							bind:value={draft.slug}
							oninput={() => {
								slugTouched = true;
								touch();
							}}
						/>
						<span class="font-mono text-[10px] text-muted-foreground/60">fixed at creation</span>
					{:else}
						<input
							class="w-full rounded-md border border-border bg-muted/40 px-1 py-0.5 font-mono text-xs text-muted-foreground outline-none"
							value={draft.slug}
							disabled
							aria-label="Slug (immutable after creation)"
						/>
						<span class="font-mono text-[10px] text-muted-foreground/60">URLs never move</span>
					{/if}
				</label>

				<label
					class="flex items-center gap-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>
					date
					<input
						type="date"
						class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs tracking-normal normal-case outline-none hover:border-border focus-visible:border-brand"
						bind:value={draft.date}
						onchange={touch}
					/>
				</label>

				<div class="flex flex-col gap-1.5">
					<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
						tags
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each tags as t (t.name)}
							<button
								type="button"
								onclick={() => toggleTag(t.name)}
								aria-pressed={draft.tags.includes(t.name)}
								class="rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors {draft.tags.includes(
									t.name
								)
									? 'border-brand bg-brand/10 text-foreground'
									: 'border-border text-muted-foreground hover:text-foreground'}"
							>
								{t.name}
							</button>
						{/each}
					</div>
				</div>

				<label class="flex flex-col gap-1.5">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>thumbnail</span
					>
					<select
						class="rounded-md border border-border bg-card px-2 py-1 font-mono text-xs outline-none focus-visible:border-brand"
						bind:value={draft.thumbnail}
						onchange={touch}
					>
						<option value={null}>none</option>
						{#each photos as p (p.id)}
							<option value={p.src}>{p.alt.slice(0, 32)}</option>
						{/each}
					</select>
				</label>

				{#if !isNew && seed}
					<div
						class="flex flex-col gap-1 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground"
					>
						<p class="mb-1 flex items-center gap-2 text-[10px] tracking-widest uppercase">
							<Clock class="size-3" />timeline
						</p>
						<span>created · {fmtDay(seed.createdAt)}</span>
						<span>published · {fmtDay(publishedAt)}</span>
						<span>updated · {updatedAt ? fmtDay(updatedAt) : '—'}</span>
						<span>rev {rev}</span>
					</div>
				{/if}
			</aside>
		{/if}
	</div>
</section>
