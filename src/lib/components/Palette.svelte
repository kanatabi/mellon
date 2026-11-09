<script lang="ts">
	import { Command, ChevronRight, CornerDownLeft, Hash, Pencil, Search } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import { tick } from 'svelte';
	import { focusOnMount } from '#lib/actions.ts';
	import { client } from '#lib/api/client.ts';
	import { parseDateExpr, shiftDate, todayISO } from '#lib/date-expr.ts';
	import type { AdminPhoto, PostSummaryAdmin, TagCount } from '#lib/api/types.ts';
	import type { Command as Cmd } from '#lib/commands.ts';
	import { photoTask } from '#lib/page-commands.svelte.ts';
	import {
		acceptsGroup,
		armMode,
		escapeAction,
		MODE_LABEL,
		usesApi,
		type PaletteMode
	} from '#lib/palette-mode.ts';

	/* Text sigils (`❯ ⌕`) don't exist in mono font stacks — the browser
	 * silently substitutes another face and the baseline drifts (owner
	 * screenshot: the pill looked off-center). SVG icons align by flex
	 * and never touch a font. Lucide v1 ships legacy class constructors:
	 * the union must be concrete for svelte-check to accept the dynamic
	 * component prop. */
	const MODE_ICON: Record<
		Exclude<PaletteMode, 'all'>,
		typeof ChevronRight | typeof Search | typeof Hash | typeof CornerDownLeft | typeof Pencil
	> = {
		commands: ChevronRight,
		content: Search,
		pages: Hash,
		// the task mode: a row here lands at the cursor, not a page —
		// corner-down-left says "insert here" without words
		insert: CornerDownLeft,
		// the buffer mode: you are typing INTO a field, pencil says so
		edit: Pencil
	};

	interface Props {
		commands: Cmd[];
		onClose: () => void;
	}

	let { commands, onClose }: Props = $props();

	let query = $state('');
	let active = $state(0);
	/* ── Modes (owner call 2026-11-08): `> ` commands · `/ ` content · `# `
	   pages · untyped searches EVERYTHING. The prefix characters are CONSUMED
	   into the pill — mode is explicit state, never re-parsed from the value,
	   which keeps IME and caret semantics boring (plain input all the way). */
	let mode = $state<PaletteMode>('all');
	/* Capitalized on purpose: Svelte compiles lowercase tags as HTML ELEMENTS —
	 * `<modeIcon>` was an empty custom element, so the pill showed a hollow
	 * gap before its label (the svelte-check "self-closing HTML tag" warning
	 * was the bug report). Dynamic components need an uppercase binding. */
	const ModeIcon = $derived(mode === 'all' ? undefined : MODE_ICON[mode]);
	/* The command that armed the current task/buffer mode — carries its
	   pillLabel override and, for edit, the commit closure; for insert, the
	   photo TASK whose handler the pick rows run. */
	let armed = $state<Cmd | null>(null);
	const pillLabel = $derived(armed?.pillLabel ?? MODE_LABEL[mode]);
	/* Submenu (owner call 2026-11-08): Enter on a parent row drills IN — the
	   palette doesn't close, it goes deeper. The stack unwinds one layer per
	   Esc: edit/insert-mode → submenu → palette ("walk back out the way you
	   came"). The submenu holds the parent's ID and reads LIVE children:
	   toggling a tag re-registers the page's commands, and a snapshotted
	   array would keep showing yesterday's ✓-marks. */
	let submenuId = $state<string | null>(null);
	const submenu = $derived(submenuId ? (commands.find((c) => c.id === submenuId) ?? null) : null);
	const backCmd = $derived<Cmd | null>(
		submenu
			? {
					id: 'submenu.back',
					title: `← ${submenu.title}`,
					group: 'actions' as const,
					shortcut: 'esc'
				}
			: null
	);

	// The palette searches CONTENT (owner doctrine, 2026-11-08): commands and
	// navigation are portal-side; "what matches?" comes from the API — one
	// debounced /search call serving posts, photos (alt/collection) and tags
	// (vocabulary). Phase B swaps the mock matcher for Meilisearch without
	// touching this. Commands/pages modes never ask it.
	let postResults = $state<PostSummaryAdmin[]>([]);
	let photoResults = $state<AdminPhoto[]>([]);
	let tagResults = $state<TagCount[]>([]);
	let searchSeq = 0;
	let searchTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const q = query.trim();
		const api = usesApi(mode);
		clearTimeout(searchTimer);
		if (!api || q.length < 2) {
			postResults = [];
			photoResults = [];
			tagResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			const seq = ++searchSeq;
			try {
				const res = await client.search(q);
				if (seq === searchSeq) {
					postResults = res.posts;
					photoResults = res.photos;
					tagResults = res.tags;
				}
			} catch {
				if (seq === searchSeq) {
					postResults = [];
					photoResults = [];
					tagResults = [];
				}
			}
		}, 200);
		return () => clearTimeout(searchTimer);
	});

	const postCommands = $derived<Cmd[]>(
		postResults.map((p) => ({
			id: `post.${p.slug}`,
			title: p.title,
			group: 'posts' as const,
			shortcut: p.status,
			run: () => void goto(`/posts/${p.slug}`)
		}))
	);

	const photoCommands = $derived<Cmd[]>(
		photoResults.map((p) => ({
			id: `photo.${p.id}`,
			title: p.alt,
			group: 'photos' as const,
			shortcut: `${p.width}×${p.height}`,
			// one destination for a photo, everywhere (owner call): the detail
			// page — never context-magic (insert here / open there)
			run: () => void goto(`/photos/${p.id}`)
		}))
	);

	const tagCommands = $derived<Cmd[]>(
		tagResults.map((t) => ({
			id: `tag.${t.name}`,
			title: t.name,
			group: 'tags' as const,
			shortcut: `${t.posts} ${t.posts === 1 ? 'post' : 'posts'}`,
			// a tag is a FILTER AXIS, not a page — Enter lands on the post
			// list already narrowed to it (the URL rides the API filter)
			run: () => void goto(`/posts?tag=${encodeURIComponent(t.name)}`)
		}))
	);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		// The stack, in priority order: TASK mode > submenu list > global list.
		if (mode === 'edit') return [];
		if (mode === 'insert') {
			const handle = photoTask(armed?.task === 'cover' ? 'cover' : 'insert');
			if (!handle) return [];
			return photoResults.map((p) => ({
				id: `insert.${p.id}`,
				title: p.alt,
				group: 'photos' as const,
				shortcut: `${p.width}×${p.height}`,
				// rows HERE act — the task was declared through the
				// submenu, so no context-magic: this is not navigation
				run: () => handle(p)
			}));
		}
		if (backCmd && submenu) {
			const kids = (submenu.children ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));
			const created = submenu.createChild?.(query.trim()) ?? null;
			return created ? [backCmd, ...kids, created] : [backCmd, ...kids];
		}
		// API results already went through the server-side q filter — they join
		// verbatim; static commands filter locally as before. Mode gates which
		// groups exist at all.
		const list = q
			? [
					...commands.filter(
						(c) => acceptsGroup(mode, c.group) && c.title.toLowerCase().includes(q)
					),
					...photoCommands,
					...postCommands,
					...tagCommands
				].filter((c) => acceptsGroup(mode, c.group))
			: commands.filter((c) => acceptsGroup(mode, c.group));
		// content first, then portal actions — searching "alpine" should find
		// the photo, not the word "actions"
		const order = { photos: 0, posts: 1, tags: 2, actions: 3, 'go to': 4, 'open recent': 5 };
		return [...list].sort(
			(a, b) => order[a.group] - order[b.group] || a.title.localeCompare(b.title)
		);
	});

	const placeholder = $derived(
		mode === 'edit'
			? armed?.editKind === 'date'
				? 'today · -3d · nov 12 · 2026-11-12 · arrows step…'
				: 'Type the new value — ⏎ commits…'
			: mode === 'insert'
				? 'Search the library — Enter applies…'
				: submenu && mode === 'all'
					? 'Filter the options…'
					: mode === 'all'
						? 'Type a command or search…'
						: mode === 'commands'
							? 'Filter commands…'
							: mode === 'content'
								? 'Search posts, photos, tags…'
								: 'Jump to a page…'
	);

	// The active row resets whenever the query (the only input to `filtered`)
	// changes — handled at the input, not via $effect, so `active` stays a
	// plain, user-mutated $state. Arming lives HERE: bind:value lands first,
	// then we try to commit a prefix.
	function onInput() {
		// in a SUBMENU LIST, selection starts on the first meaningful row,
		// not the back row — but a task/edit mode riding above the submenu
		// has no back row: it selects from the top, always
		active = mode === 'all' && submenu ? 1 : 0;
		// sigils arm only from the plain palette — inside a submenu the text
		// is a child filter, and a typed grammar never interrupts a task
		if (mode === 'all' && !submenu) {
			const sigil = armMode(query);
			if (sigil) {
				mode = sigil.mode;
				armed = null; // typed grammar has no command behind it
				query = sigil.arg;
			}
		}
	}

	function disarm() {
		mode = 'all';
		armed = null;
		query = '';
		active = 0;
	}

	/** The buffer mode has no rows — the hint line IS the UI: parse feedback
	 *  for dates (live), commit state for text. */
	const editHint = $derived.by(() => {
		const a = armed;
		if (!a) return '';
		if (a.editKind === 'date') {
			const w = parseDateExpr(query);
			if (!w) return 'not a date — try: today · -3d · nov 12 · last week · a..b · ←→ ±1d ↑↓ ±1w';
			const label = w.from === w.to ? w.from : `${w.from} .. ${w.to}`;
			if (w.from !== w.to && !a.editRange) return `${label} — this field takes ONE date`;
			return `${label}${query === (a.seed ?? '') ? ' · unchanged' : ' — ⏎ saves'} · esc cancels`;
		}
		return `⏎ saves to ${a.pillLabel ?? 'field'}${query === (a.seed ?? '') ? ' · buffer unchanged' : ' — buffer edited'} · esc cancels`;
	});

	const inputLabel = $derived(
		mode === 'edit'
			? `Editing ${pillLabel.toLowerCase()}`
			: mode === 'all'
				? 'Search commands and content'
				: `Search ${MODE_LABEL[mode]}`
	);

	/** Enter inside the buffer mode: the query IS the value. Date commits
	 *  parse through the grammar first — an unparseable buffer (or a range
	 *  aimed at a single-date field) must never eat the user's typing. */
	function commitEdit() {
		const a = armed;
		if (!a?.commit) return disarm();
		if (a.editKind === 'date') {
			const w = parseDateExpr(query);
			if (!w) return; // hint row already says "not a date"
			if (w.from !== w.to && !a.editRange) return; // single fields reject windows
			// re-serialize canonically: the page re-parses one honest grammar
			const value = w.from === w.to ? w.from : `${w.from}..${w.to}`;
			if (a.commit(value) === false) return;
		} else if (a.commit(query) === false) {
			return;
		}
		// committed: stay open, fall back to the command list (ruling 2 —
		// chaining fields is the whole keyboard-first point)
		disarm();
	}

	function run(cmd: Cmd | undefined) {
		if (!cmd) return;
		// back rows and drill-parents never close the palette — they move it
		if (cmd === backCmd) {
			submenuId = null;
			query = '';
			active = 0;
			return;
		}
		if (cmd.children) {
			submenuId = cmd.id;
			mode = 'all';
			armed = null;
			query = '';
			// land on the first option, never on `← back`
			active = 1;
			return;
		}
		if (cmd.edit) {
			armed = cmd;
			mode = 'edit';
			query = cmd.seed ?? ''; // seeded EDIT, not replace
			active = 0;
			return;
		}
		if (cmd.arm) {
			// declarative arming (a task mode entered through a command);
			// the palette interprets, the page never reaches in
			armed = cmd;
			mode = cmd.arm;
			query = '';
			active = 0; // a task mode selects from the top — no back row here
			return;
		}
		if (cmd.keepOpen) {
			// toggles inside a submenu: run, stay, and KEEP THE SELECTION on
			// this row — declaration order is stable, so the ✓ the user just
			// flipped is exactly where their eyes are
			cmd.run?.();
			return;
		}
		onClose();
		cmd.run?.();
	}

	function onKey(e: KeyboardEvent) {
		// the date stepper: in a date buffer, arrows stop moving rows (there
		// are none) and start moving the DAY — ←→ ±1d, ↑↓ ±1w
		if (mode === 'edit' && armed?.editKind === 'date') {
			const step =
				e.key === 'ArrowLeft'
					? { days: -1 }
					: e.key === 'ArrowRight'
						? { days: 1 }
						: e.key === 'ArrowUp'
							? { weeks: 1 }
							: e.key === 'ArrowDown'
								? { weeks: -1 }
								: null;
			if (step) {
				e.preventDefault();
				const w = parseDateExpr(query);
				if (w && w.from !== w.to && armed.editRange) {
					// a window slides whole — both endpoints move
					query = `${shiftDate(w.from, step)}..${shiftDate(w.to, step)}`;
				} else {
					const base = w?.from ?? parseDateExpr(armed.seed ?? '')?.from ?? armed.seed ?? todayISO();
					query = shiftDate(base, step);
				}
				return;
			}
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (mode === 'edit') return commitEdit();
			run(filtered[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			// the stack unwinds ONE layer per Esc — buffer/task mode, then
			// submenu, then the palette itself ("walk back out the way you came")
			const step = escapeAction({ mode, inSubmenu: submenu !== null });
			if (step === 'disarm') disarm();
			else if (step === 'close-submenu') {
				submenuId = null;
				query = '';
				active = 0;
			} else onClose();
		} else if (e.key === 'Backspace' && query === '' && mode !== 'all') {
			// an empty backspace disarms the chip — the mode was a detour,
			// Backspace walks you back out of it
			disarm();
		}
	}

	function scrollActiveIntoView(el: HTMLUListElement) {
		$effect(() => {
			el.children[active]?.scrollIntoView({ block: 'nearest' });
		});
	}

	/* Focus is part of the contract (keyboard-first): keepOpen picks NAVIGATE
	   under the still-open palette (status/tag/sort chains), and SvelteKit's
	   re-render can drop the focus outside the dialog — then keys (even Esc)
	   hit deaf ears. While the palette is mounted, the input reclaims focus
	   on every URL change; no-op when it already holds it. */
	let inputEl = $state<HTMLInputElement | undefined>();
	$effect(() => {
		void page.url.href;
		tick().then(() => {
			if (inputEl && document.activeElement !== inputEl) inputEl.focus();
		});
	});
</script>

<!-- Modal scrim like the blog's palette (dim + blur); sheet is command-first.
     Escape/outside close; focus returns to the opener (shell owns that half). -->
<div
	transition:fade={{ duration: 120 }}
	class="fixed inset-0 z-40 flex items-start justify-end bg-background/70 p-4 pt-16 pr-4 backdrop-blur-sm lg:pr-8"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
	onkeydown={onKey}
>
	<div
		transition:fly={{ y: -10, duration: 160 }}
		class="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
	>
		<label class="flex items-center gap-3 border-b border-border px-4 focus-within:border-brand">
			<Command class="size-4 shrink-0 text-muted-foreground" />
			{#if ModeIcon}
				<!-- The chip: the consumed prefix, now a named mode. aria-hidden —
				     the input's label already speaks the mode for AT. -->
				<span
					aria-hidden="true"
					class="flex shrink-0 items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-2 py-1 font-mono text-[10px] leading-none tracking-widest text-brand uppercase select-none"
				>
					<ModeIcon class="size-3 shrink-0" />
					{pillLabel}
				</span>
			{/if}
			<input
				type="text"
				bind:this={inputEl}
				class="w-full bg-transparent py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
				{placeholder}
				bind:value={query}
				oninput={onInput}
				aria-label={inputLabel}
				use:focusOnMount
			/>
			<kbd
				class="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
				>esc</kbd
			>
		</label>
		<ul
			class="max-h-[min(48vh,360px)] overflow-y-auto p-1.5"
			use:scrollActiveIntoView
			role="listbox"
			aria-label="Commands"
		>
			{#each filtered as cmd, i (cmd.id)}
				<li role="option" aria-selected={i === active}>
					<button
						type="button"
						class="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left text-sm {i ===
						active
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
						onclick={() => run(cmd)}
						onpointerenter={() => (active = i)}
					>
						<span class="min-w-0 truncate">
							<!-- group chips only earn their noise when MULTIPLE kinds
							     share the list — a forced mode or a submenu already
							     says what rows are -->
							{#if mode === 'all' && !submenu}
								<span
									class="mr-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase"
								>
									{cmd.group}
								</span>
							{/if}
							{cmd.title}
						</span>
						{#if cmd.shortcut}
							<span class="shrink-0 font-mono text-[10px] text-muted-foreground/70"
								>{cmd.shortcut}</span
							>
						{/if}
					</button>
				</li>
			{:else}
				<li class="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
					{#if mode === 'edit'}
						{editHint}
					{:else if mode === 'content' && query.trim().length < 2}
						type at least two characters — posts, photos &amp; tags
					{:else if mode === 'insert' && query.trim().length < 2}
						type at least two characters — library photos
					{:else}
						nothing matches &ldquo;{query}&rdquo;
					{/if}
				</li>
			{/each}
		</ul>
		<!-- The legend: the grammar must be SEEN to be believed — a
		     keyboard-first UI documents its sigils (shown while unmoded/idle). -->
		{#if mode === 'all' && !query && !submenu}
			<div
				class="flex items-center gap-4 border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground/70"
			>
				<span class="flex items-center gap-1.5"
					><ChevronRight class="size-3 text-foreground" /> commands</span
				>
				<span class="flex items-center gap-1.5"
					><Search class="size-3 text-foreground" /> content</span
				>
				<span class="flex items-center gap-1.5"><Hash class="size-3 text-foreground" /> pages</span>
			</div>
		{/if}
	</div>
</div>
