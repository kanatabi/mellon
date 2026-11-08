<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import {
		Clock,
		ClipboardCopy,
		Download,
		Eye,
		EyeOff,
		FileCog,
		PanelRightClose,
		PanelRightOpen,
		Printer,
		WrapText
	} from 'lucide-svelte';
	import { onMount, tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import CodeMirrorEditor from '#lib/components/CodeMirrorEditor.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import DeleteDialog from '#lib/components/DeleteDialog.svelte';
	import RailDrawer from '#lib/components/RailDrawer.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { editorRail } from '#lib/rails.svelte.ts';
	import { renderMermaid } from '#lib/mermaid-preview.ts';
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

	// ── Mobile pane tabs (owner call 2026-11-08): below lg, editor and preview
	// swap as tabs instead of stacking — a long post must never force a scroll
	// to read the render. Both panes stay MOUNTED (instant switch, selection
	// and diagrams survive); `max-lg:` classes hide the inactive one so the
	// state is viewport-independent and hydration-safe (no media-query JS), and
	// visibility:hidden removes it from tab order and the a11y tree.
	let editorTab = $state<'write' | 'preview'>('write');
	let writeTabBtn = $state<HTMLButtonElement | undefined>();
	let previewTabBtn = $state<HTMLButtonElement | undefined>();
	function setTab(t: 'write' | 'preview', refocus = true) {
		editorTab = t;
		localStorage.setItem('mellon.tab.editor', t);
		if (refocus) (t === 'write' ? writeTabBtn : previewTabBtn)?.focus();
	}
	onMount(() => {
		const stored = localStorage.getItem('mellon.tab.editor');
		if (stored === 'preview') editorTab = 'preview'; // adopt AFTER hydration
		if (localStorage.getItem('mellon.wrap') === '0') wrapped = false;
	});

	// Line wrap: a plain toggle in the meta bar (all viewports), state owned
	// here, applied by the editor through the `wrap` prop.
	let wrapped = $state(true);
	function toggleWrap() {
		wrapped = !wrapped;
		localStorage.setItem('mellon.wrap', wrapped ? '1' : '0');
	}
	// Preview stays live while visible on desktop OR on mobile (the hidden tab
	// keeps rendering ahead of the switch — that's what makes it instant).
	const previewLive = $derived(showPreview || editorTab === 'preview');

	// Debounced near-real-time preview (server endpoint = the vendored pipeline).
	// 120ms: reads as "while typing" but batches a burst of keystrokes into one
	// render round-trip — the pipeline runs Shiki, not a regex.
	let previewTimer: ReturnType<typeof setTimeout>;
	let previewEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		const md = draft.content;
		if (!previewLive) return;
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

	// Mermaid lifecycle: render fences 450ms after the keystroke burst settles.
	// There is NO pending/shimmer state by design (mermaid-preview.ts): while
	// typing, the dashed source block IS the honest waiting state — it can never
	// get stuck, because leaving it only requires a SUCCESSFUL render.
	let mermaidTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		if (!previewEl || !previewLive || !html) return;
		const el = previewEl;
		clearTimeout(mermaidTimer);
		mermaidTimer = setTimeout(() => void renderMermaid(el), 450);
	});
	$effect(() => {
		void themeState.theme; // flip: re-diagram from the surviving sources
		if (!previewEl || !previewLive || !html) return;
		const el = previewEl;
		void tick().then(() => renderMermaid(el, true));
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

	// Deletion is intentional (item #5): GitHub's name-retype pattern via a real
	// dialog — native confirm() trusted a single click for permanent loss.
	let confirmDelete = $state(false);
	async function remove() {
		await client.deletePost(draft.slug);
		dirty = false; // deliberate exit — skip the SPA guard
		await goto('/posts');
	}

	// ── Export (item #3) — portable author artifacts, not the storage contract:
	// YAML front-matter + the raw Route B body. PDF prints the live preview DOM
	// (rendered diagrams included) through the browser's own Save-as-PDF.
	let exportMsg = $state('');
	let exportTimer: ReturnType<typeof setTimeout>;
	function flashExport(msg: string) {
		exportMsg = msg;
		clearTimeout(exportTimer);
		exportTimer = setTimeout(() => (exportMsg = ''), 2500);
	}

	function markdownDoc(): string {
		const fm = [
			'---',
			`title: ${JSON.stringify(draft.title || 'Untitled')}`,
			draft.subtitle ? `subtitle: ${JSON.stringify(draft.subtitle)}` : '',
			`slug: ${draft.slug || slugify(draft.title)}`,
			`date: ${draft.date}`,
			draft.tags.length ? `tags: [${draft.tags.map((t) => JSON.stringify(t)).join(', ')}]` : '',
			draft.thumbnail ? `thumbnail: ${draft.thumbnail}` : '',
			'---'
		].filter(Boolean);
		return `${fm.join('\n')}\n\n${draft.content}\n`;
	}

	function exportMd() {
		const blob = new Blob([markdownDoc()], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${draft.slug || slugify(draft.title) || 'post'}.md`;
		a.click();
		URL.revokeObjectURL(url);
		flashExport('markdown downloaded');
	}

	async function copyMd() {
		try {
			await navigator.clipboard.writeText(markdownDoc());
			flashExport('markdown copied');
		} catch {
			flashExport('clipboard blocked by the browser');
		}
	}

	async function exportPdf() {
		// Prefer the LIVE pane (mermaid SVGs already hydrated inside it); fall
		// back to a fresh render for preview-off exports.
		const body =
			showPreview && html && previewEl ? previewEl.innerHTML : (await preview(draft.content)).html;
		const safeTitle = (draft.title || 'Untitled').replace(
			/[&<>"]/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
		);
		const w = window.open('', 'mellon-export', 'width=880,height=1000');
		if (!w) {
			flashExport('popup blocked — allow popups to export PDF');
			return;
		}
		w.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
	body{font:15px/1.65 system-ui,-apple-system,'Segoe UI',Inter,sans-serif;color:#18181b;
		max-width:44rem;margin:0 auto;padding:2.5rem 1.5rem}
	h1,h2,h3{font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.015em;line-height:1.25}
	h1{font-size:2rem}h2{font-size:1.4rem;margin-top:2rem}h3{font-size:1.15rem}
	p{margin:0.9rem 0}a{color:#6d28d9;text-decoration:none}
	pre{border:1px solid #e4e4e7;border-radius:8px;padding:.75rem 1rem;overflow-x:auto;
		font-size:.78rem;background:#fafafa;white-space:pre-wrap}
	code{font-family:ui-monospace,'JetBrains Mono',monospace}
	code:not([class]){background:#f4f4f5;border-radius:4px;padding:.1rem .35rem;font-size:.85em}
	.shiki,.shiki span{color:var(--shiki-light);background:var(--shiki-light-bg)}
	table{border-collapse:collapse;margin:1rem 0}th,td{border-bottom:1px solid #e4e4e7;
		padding:.4rem .9rem;text-align:left}th{font-weight:600}
	blockquote{border-left:2px solid #e4e4e7;margin:.9rem 0;padding-left:1rem;color:#52525b}
	img{max-width:100%;border-radius:8px}
	ul,ol{padding-left:1.4rem}
	.mermaid-box{display:flex;justify-content:center;margin:1.2rem 0}
	.mermaid-box svg{max-width:100%;height:auto}
	.mermaid-src,.mermaid-error{border:1px dashed #e4e4e7;border-radius:8px;padding:.75rem 1rem;
		font-size:.72rem;background:#fafafa}
	[hidden]{display:none}
	input[type='checkbox']{accent-color:#7c3aed}
	@page{margin:2cm}
</style></head><body class="prose">${body}</body></html>`);
		w.document.close();
		w.focus();
		setTimeout(() => w.print(), 350);
		flashExport('print dialog opened');
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			void save();
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			// save must stay reachable with the actions rail collapsed
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
		<!-- Meta bar: entity title wears the serif; only the preview toggle
		     lives here — verbs moved to the post rail's actions block. -->
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
				{#if dirty}
					<span
						transition:fade={{ duration: 140 }}
						class="flex items-center gap-1.5 font-mono text-[10px] text-brand"
						role="status"
					>
						<span class="size-1.5 rounded-full bg-brand"></span>
						unsaved
					</span>
				{/if}
				<button
					type="button"
					onclick={() => (showPreview = !showPreview)}
					class="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs transition-colors lg:flex {showPreview
						? 'border-brand bg-brand/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={showPreview}
				>
					{#if showPreview}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
					preview
				</button>
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

		<!-- Phones & tablets below lg: editor and preview swap as tabs (owner
		     call 2026-11-08) — reading a long post's render should never cost a
		     scroll. Panels stay mounted; the inactive one is visibility-hidden
		     via max-lg: variants so desktop semantics (split + eye toggle) are
		     untouched by the mobile state. Roving tabindex: Tab lands on the
		     selected pane's tab, arrows walk between them. -->
		<!-- Pane controls row (owner call): the tabs (below lg) sit left, the
		     wrap toggle rides the same row at its far right — pane controls in
		     one band, on every viewport. Tabs vanish at lg (the split view
		     needs no tab); wrap stays. -->
		<div class="flex items-center gap-2">
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="flex w-fit gap-1 rounded-full border border-border bg-card p-1 lg:hidden"
				role="tablist"
				aria-label="Editor pane"
				onkeydown={(e) => {
					if (e.key === 'ArrowRight' || e.key === 'End') {
						e.preventDefault();
						setTab('preview');
					} else if (e.key === 'ArrowLeft' || e.key === 'Home') {
						e.preventDefault();
						setTab('write');
					}
				}}
			>
				<button
					type="button"
					id="tab-write"
					role="tab"
					aria-selected={editorTab === 'write'}
					aria-controls="pane-write"
					tabindex={editorTab === 'write' ? 0 : -1}
					bind:this={writeTabBtn}
					onclick={() => setTab('write', false)}
					class="rounded-full px-4 py-1 font-mono text-xs transition-colors {editorTab === 'write'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					write
				</button>
				<button
					type="button"
					id="tab-preview"
					role="tab"
					aria-selected={editorTab === 'preview'}
					aria-controls="pane-preview"
					tabindex={editorTab === 'preview' ? 0 : -1}
					bind:this={previewTabBtn}
					onclick={() => setTab('preview', false)}
					class="rounded-full px-4 py-1 font-mono text-xs transition-colors {editorTab === 'preview'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					preview
				</button>
			</div>
			<button
				type="button"
				onclick={toggleWrap}
				aria-pressed={wrapped}
				class="ml-auto flex items-center gap-2 self-stretch rounded-full border border-border px-3 py-1.5 font-mono text-xs transition-colors {wrapped
					? 'border-brand bg-brand/10 text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<WrapText class="size-3.5" />
				wrap
			</button>
		</div>

		<!-- Pane area. Below lg: a fixed viewport-height box (NOT flex-1 — its
		     0% flex-basis overrides the explicit height in an indefinite
		     column and collapsed the panes to zero: the empty-editor bug) with
		     the two panes layered; tabs decide which is visible. lg+: flex
		     fills the row and the split grid animates 1fr↔0fr — the pane never
		     leaves layout, so nothing can reflow (old ghost bug). -->
		<div
			class="relative h-[calc(100svh-13.5rem)] min-h-0 shrink-0 transition-[grid-template-columns,gap] duration-200 ease-out lg:grid lg:h-auto lg:min-h-0 lg:flex-1 {showPreview
				? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-4'
				: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0fr)] lg:gap-0'}"
		>
			<div
				id="pane-write"
				role="tabpanel"
				aria-labelledby="tab-write"
				class="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card transition-opacity duration-150 lg:static lg:min-h-0 {editorTab ===
				'preview'
					? 'max-lg:invisible max-lg:opacity-0'
					: ''}"
			>
				<CodeMirrorEditor
					bind:value={draft.content}
					onchange={touch}
					{vim}
					wrap={wrapped}
					class="h-full"
				/>
			</div>

			<div
				id="pane-preview"
				role="tabpanel"
				aria-labelledby="tab-preview"
				class="absolute inset-0 min-h-0 min-w-0 overflow-hidden transition-opacity duration-150 lg:static {showPreview
					? ''
					: 'hidden lg:block'} {editorTab === 'write' ? 'max-lg:invisible max-lg:opacity-0' : ''}"
			>
				<div
					bind:this={previewEl}
					class="preview h-full min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-5 transition-opacity duration-150 lg:min-w-[360px] {showPreview
						? 'opacity-100'
						: 'opacity-0'}"
					aria-label="Rendered preview"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-rendered, DOMPurify-sanitized in the pipeline -->
					<div class="prose max-w-none">{@html html}</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Post rail — actions + slug/date/tags/thumbnail + export + timeline.
	     The header names the whole rail; sections label themselves. The
	     container animates its width; the content curtains inside it (item #6). -->
	<div
		class="hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out lg:block {editorRail.collapsed
			? 'w-9'
			: 'w-72'}"
	>
		{#if editorRail.collapsed}
			<button
				type="button"
				onclick={editorRail.toggle}
				aria-label="Open post rail"
				class="flex h-full w-9 flex-col items-center gap-3 rounded-lg border border-border bg-card py-3 text-muted-foreground transition-colors hover:text-foreground"
			>
				<PanelRightOpen class="size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase [writing-mode:vertical-rl]"
					>post</span
				>
			</button>
		{:else}
			<aside
				transition:fade={{ duration: 120 }}
				class="flex w-72 flex-col gap-5 self-stretch overflow-y-auto rounded-lg border border-border bg-card p-4"
				aria-label="Post actions and settings"
			>
				<div class="flex items-center justify-between">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">post</p>
					<button
						type="button"
						onclick={editorRail.toggle}
						aria-label="Collapse post rail"
						class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<PanelRightClose class="size-4" />
					</button>
				</div>

				{@render railBody()}
			</aside>
		{/if}
	</div>

	{#snippet railBody()}
		<!-- Actions block (owner call): save/publish/delete live at the
				     top of the rail under their own label — the CMS "publish
				     box" position, never under "settings". -->
		<div class="flex flex-col gap-2">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">actions</p>
			<button
				type="button"
				disabled={saving}
				onclick={() => void save()}
				class="w-full rounded-full border border-border px-4 py-2 text-sm transition-all hover:border-muted-foreground active:scale-[0.98] disabled:opacity-40"
			>
				{isNew ? 'create' : 'save draft'}<span class="ml-1.5 text-muted-foreground">⏎</span>
			</button>
			{#if status === 'published'}
				<button
					type="button"
					disabled={saving}
					onclick={() => void unpublish()}
					class="w-full rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-all hover:text-foreground active:scale-[0.98] disabled:opacity-40"
				>
					unpublish
				</button>
			{:else}
				<button
					type="button"
					disabled={saving}
					onclick={() => void publish()}
					class="w-full rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
				>
					publish
				</button>
			{/if}
			{#if !isNew}
				<button
					type="button"
					onclick={() => (confirmDelete = true)}
					class="w-full rounded-full px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
				>
					delete
				</button>
			{/if}
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
			<textarea
				rows="3"
				class="w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm leading-snug outline-none hover:border-border focus-visible:border-brand"
				bind:value={draft.subtitle}
				oninput={touch}></textarea>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>slug</span
			>
			{#if isNew}
				<input
					class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs outline-none hover:border-border focus-visible:border-brand"
					placeholder="auto from title"
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

		<div class="flex flex-col gap-1">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">date</p>
			<!-- earendil's calendar popover, single-pick shape (item #6): the
					     native date input is stock, not ours. -->
			<DatePicker
				value={draft.date}
				onchange={(iso) => {
					draft.date = iso;
					touch();
				}}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">tags</p>
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

		<div class="flex flex-col gap-1.5 border-t border-border pt-4">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">export</p>
			<div class="flex flex-col gap-1.5">
				<button
					type="button"
					onclick={exportMd}
					class="flex items-center gap-2.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground active:scale-[0.99]"
				>
					<Download class="size-3.5" />download markdown
				</button>
				<button
					type="button"
					onclick={exportPdf}
					class="flex items-center gap-2.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground active:scale-[0.99]"
				>
					<Printer class="size-3.5" />save as PDF
				</button>
				<button
					type="button"
					onclick={copyMd}
					class="flex items-center gap-2.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground active:scale-[0.99]"
				>
					<ClipboardCopy class="size-3.5" />copy markdown
				</button>
			</div>
			{#if exportMsg}
				<p
					class="font-mono text-[10px] text-brand"
					role="status"
					transition:fade={{ duration: 150 }}
				>
					{exportMsg}
				</p>
			{/if}
		</div>

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
	{/snippet}

	<!-- Phones: the same rail arrives as a bottom sheet (earendil's
	     RailDrawer recipe) — drag down, Esc, or the X dismisses it. -->
	<RailDrawer label="Post actions and settings" icon={FileCog}>
		{@render railBody()}
	</RailDrawer>

	{#if confirmDelete}
		<DeleteDialog
			title={draft.title || 'Untitled'}
			slug={draft.slug}
			onConfirm={remove}
			onClose={() => (confirmDelete = false)}
		/>
	{/if}
</section>
