<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CodeMirrorEditor from '#lib/components/CodeMirrorEditor.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { ApiError, client, preview } from '#lib/api/client.ts';
	import type { PostDraft } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed-once: the editor OWNS its
	// copy after mount (server `data` is the initial doc; save/publish update
	// the local mirrors below).
	// svelte-ignore state_referenced_locally
	const seed = data.post;
	let draft = $state<PostDraft>({ ...seed });
	let rev = $state(seed.rev);
	let status = $state(seed.status);
	let updatedAt = $state(seed.updatedAt);
	let dirty = $state(false);
	let message = $state<{ kind: 'ok' | 'err' | 'conflict'; text: string } | null>(null);
	let showPreview = $state(true);
	let html = $state('');
	let saving = $state(false);

	// Debounced true-to-prod preview (server endpoint = the vendored pipeline).
	let previewTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const md = draft.content;
		clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			try {
				html = (await preview(md)).html;
			} catch {
				html = '<p class="font-mono text-xs text-danger">preview failed;</p>';
			}
		}, 250);
		return () => clearTimeout(previewTimer);
	});

	function touch() {
		dirty = true;
		message = null;
	}

	// Unsaved-changes guard (M4b): the browser prompt only while dirty.
	$effect(() => {
		if (!dirty) return;
		const block = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', block);
		return () => window.removeEventListener('beforeunload', block);
	});

	async function save(): Promise<boolean> {
		saving = true;
		try {
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

	async function publish() {
		if (dirty && !(await save())) return;
		const res = await client.publishPost(draft.slug);
		status = res.status;
		rev = res.rev;
		updatedAt = res.updatedAt;
		message = { kind: 'ok', text: 'published;' };
	}

	async function unpublish() {
		const res = await client.unpublishPost(draft.slug);
		status = res.status;
		rev = res.rev;
		message = { kind: 'ok', text: 'back to draft;' };
	}

	async function remove() {
		if (!confirm('Delete this post for good?')) return;
		await client.deletePost(draft.slug);
		await invalidateAll();
		location.href = '/posts';
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
</script>

<svelte:head>
	<title>{draft.title} · mellon;</title>
</svelte:head>

<!-- ⌘/Ctrl+Enter saves — window-scoped (an element handler on a plain
     <section> would trip the a11y non-interactive rule and miss editor keys
     anyway, since CodeMirror stops keydown propagation). -->
<svelte:window onkeydown={onKey} />

<section class="flex min-h-full flex-col gap-4">
	<!-- Meta bar: entity title wears the serif; two verbs live right. -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<h1 class="min-w-0 truncate font-brand text-2xl font-semibold tracking-tight">
				{draft.title || 'untitled'}
			</h1>
			<StatusPill {status} />
			<span class="font-mono text-[10px] text-muted-foreground/70"
				>rev {rev} · {updatedAt.slice(0, 16)}</span
			>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (showPreview = !showPreview)}
				class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				aria-pressed={showPreview}
			>
				preview;
			</button>
			<button
				type="button"
				onclick={() => void remove()}
				class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-danger transition-colors hover:bg-danger/10"
			>
				delete;
			</button>
			<button
				type="button"
				disabled={saving}
				onclick={() => void save()}
				class="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-muted-foreground disabled:opacity-40"
			>
				save draft<span class="text-muted-foreground">⏎</span>
			</button>
			{#if status === 'published'}
				<button
					type="button"
					onclick={() => void unpublish()}
					class="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					unpublish;
				</button>
			{:else}
				<button
					type="button"
					disabled={saving}
					onclick={() => void publish()}
					class="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
				>
					publish<span class="text-white/70">;</span>
				</button>
			{/if}
		</div>
	</div>

	{#if message}
		<p
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
		<div class="flex min-h-0 flex-col gap-4">
			<div class="flex gap-3">
				<label class="flex min-w-0 grow flex-col gap-1">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>title</span
					>
					<input
						class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-border focus-visible:border-brand"
						bind:value={draft.title}
						oninput={touch}
					/>
				</label>
				<label class="flex w-24 flex-col gap-1">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>date</span
					>
					<input
						type="date"
						class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-sm outline-none hover:border-border focus-visible:border-brand"
						bind:value={draft.date}
						onchange={touch}
					/>
				</label>
			</div>
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

			<div class="flex flex-wrap gap-1.5">
				{#each data.tags as t (t.name)}
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

			<label class="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
				thumbnail —
				<select
					class="rounded-md border border-border bg-card px-2 py-1 outline-none focus-visible:border-brand"
					bind:value={draft.thumbnail}
					onchange={touch}
				>
					<option value={null}>none;</option>
					{#each data.photos as p (p.id)}
						<option value={p.src}>{p.alt.slice(0, 32)}</option>
					{/each}
				</select>
			</label>

			<div
				class="min-h-[50vh] flex-1 overflow-hidden rounded-lg border border-border bg-card lg:min-h-0"
			>
				<CodeMirrorEditor
					bind:value={draft.content}
					onchange={() => touch()}
					vim={page.data.vim ?? false}
					class="h-full"
				/>
			</div>
		</div>

		{#if showPreview}
			<div
				class="preview min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-5"
				aria-label="Rendered preview"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-rendered, DOMPurify-sanitized in the pipeline -->
				<div class="prose max-w-none">{@html html}</div>
			</div>
		{/if}
	</div>
</section>
