<script lang="ts">
	import { ArrowLeft, Copy, Ellipsis, RotateCcw } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import { CORE_TOKENS, type CoreToken } from '#lib/theme-registry.ts';
	import { slugify, ThemeValidationError, validateCustomTheme } from '#lib/custom-theme.ts';
	import { customThemes, getCustomTheme, saveCustomTheme } from '#lib/custom-themes.svelte.ts';
	import { reapplyThemeVars, setTheme } from '#lib/theme-state.svelte.ts';
	import { computedTokens, readThemeTokens } from '#lib/theme-css.ts';
	import type { ThemeId, ThemeMode } from '#lib/theme.ts';

	// The theme editor (the theming round 3, the human-first restyle
	// 2026-11-23): the MEANING leads, the token machinery follows — every
	// row is a named color with a swatch; the picker (and its hex field) is
	// the only editor; the token name demotes to a subtitle; no raw text
	// inputs, no filter. COPY RULE: name the anatomy, never the page (page
	// names drift; the editor's copy must not).
	// Mechanics unchanged: the draft is a NAME + both modes' token maps;
	// the LIVE preview paints the draft over the real app through the apply
	// seam and REVERTS on every change and unmount — the draft never
	// persists unless Save says so. The seed:
	//   custom-<id>  → the stored body (editing it in place)
	//   ?fork=<id>   → that built-in's TWO blocks read out of our own CSS
	//   new          → the theme being worn, both halves (tweak-first)
	const { id } = $derived(page.params);
	const forkId = $derived(page.url.searchParams.get('fork'));

	type Draft = {
		light: Partial<Record<CoreToken, string>>;
		dark: Partial<Record<CoreToken, string>>;
	};

	let name = $state('');
	let tokens = $state<Draft>({ light: {}, dark: {} });
	let forkBase = $state<Draft>({ light: {}, dark: {} });
	let editMode = $state<ThemeMode>('light');
	let live = $state(true);
	let issues = $state<string[]>([]);
	let existingId = $state<`${'custom'}-${string}` | null>(null);

	// ── the picker state: ONE popover open at a time (clicking another chip
	// sets this — the previous popover's `open` flips false), recents shared
	// across every chip (localStorage, 8 max).
	let openToken = $state<string | null>(null);
	const RECENTS_KEY = 'mellon.color-recent';
	let recents = $state<string[]>(loadRecents());

	function loadRecents(): string[] {
		try {
			const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as unknown;
			return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : [];
		} catch {
			return [];
		}
	}

	function rememberColor(hex: string) {
		recents = [hex, ...recents.filter((r) => r !== hex)].slice(0, 8);
		localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
	}

	/** The picker's harmonizing presets: the draft's OTHER token values
	 *  (both halves, deduped) — pick the border's color from the muted
	 *  swatch and the theme stays coherent. */
	function swatchesFor(tk: string): string[] {
		const own = tokens[editMode as ThemeMode][tk as CoreToken];
		const all = [...Object.values(tokens.light), ...Object.values(tokens.dark)];
		const seen: string[] = [];
		const out: string[] = [];
		for (const v of all) {
			if (!v || v === own || seen.includes(v)) continue;
			seen.push(v);
			out.push(v);
		}
		return out.slice(0, 10);
	}

	/** The human labels — the MEANING leads. Hints are functional, never
	 *  navigational (the copy rule: name the anatomy, never the page). */
	const LABELS: Record<CoreToken, { label: string; hint: string }> = {
		background: { label: 'Page background', hint: 'the canvas everything sits on' },
		card: { label: 'Card surface', hint: 'the panels and cards' },
		chrome: { label: 'Chrome', hint: 'the rails and the top bar' },
		muted: { label: 'Muted surface', hint: 'the quiet fills and thumbnails' },
		accent: { label: 'Hover wash', hint: 'the quiet hover background' },
		border: { label: 'Borders', hint: 'the hairlines between things' },
		foreground: { label: 'Body text', hint: 'the main ink' },
		'muted-foreground': { label: 'Muted text', hint: 'the secondary ink' },
		brand: { label: 'Brand', hint: 'the one loud voice' },
		'accent-blue': { label: 'Blue marker', hint: 'a wayfinding hue — icons, pills, markers' },
		'accent-teal': { label: 'Teal marker', hint: 'a wayfinding hue — icons, pills, markers' },
		'accent-amber': { label: 'Amber marker', hint: 'a wayfinding hue — icons, pills, markers' },
		'accent-slate': { label: 'Slate marker', hint: 'a wayfinding hue — icons, pills, markers' },
		danger: { label: 'Danger', hint: 'destructive actions only' },
		'diff-add': { label: 'Diff added', hint: 'the added-lines tint' },
		'diff-del': { label: 'Diff removed', hint: 'the removed-lines tint' }
	};

	/** The sections, in the user's order of interest — titles describe
	 *  ROLES, never destinations (the copy rule). */
	const SECTIONS: { title: string; hint: string; tokens: CoreToken[] }[] = [
		{
			title: 'Surfaces',
			hint: 'the canvas everything sits on',
			tokens: ['background', 'card', 'chrome', 'muted', 'accent', 'border']
		},
		{ title: 'Text', hint: 'the ink, loud and quiet', tokens: ['foreground', 'muted-foreground'] },
		{ title: 'Brand', hint: 'the one loud voice', tokens: ['brand'] },
		{
			title: 'Wayfinding',
			hint: 'the hues icons, pills and markers wear',
			tokens: ['accent-blue', 'accent-teal', 'accent-amber', 'accent-slate']
		},
		{ title: 'Danger', hint: 'destructive actions only', tokens: ['danger'] },
		{ title: 'Diff tints', hint: 'the code-comparison colors', tokens: ['diff-add', 'diff-del'] }
	];

	/** Seed per the route shape. Re-runs on param change — a different id is
	 *  a different draft by definition. THE SELF-LOOP RULE (walked live:
	 *  effect_update_depth_exceeded): an effect must never READ a $state it
	 *  also writes — every read is a dependency, so read-after-write in the
	 *  same effect re-triggers itself forever. Compute into LOCALS, write
	 *  each state exactly once at the end. */
	$effect(() => {
		const pid = id ?? '';
		const pf = forkId;
		const base = computedTokens(); // local — never assign-then-read a $state here
		let nextName = '';
		let nextTokens: Draft = { light: {}, dark: {} };
		let nextFork: Draft = { light: {}, dark: {} };
		let nextExisting: `${'custom'}-${string}` | null = null;

		if (pid.startsWith('custom-')) {
			const stored = getCustomTheme(pid);
			if (stored) {
				nextName = stored.name;
				nextTokens = { light: { ...stored.tokens.light }, dark: { ...stored.tokens.dark } };
				nextFork = { light: { ...stored.tokens.light }, dark: { ...stored.tokens.dark } };
				nextExisting = pid as `${'custom'}-${string}`;
			}
		} else if (pf) {
			nextTokens = {
				light: readThemeTokens(pf as ThemeId, 'light'),
				dark: readThemeTokens(pf as ThemeId, 'dark')
			};
			nextFork = { light: { ...nextTokens.light }, dark: { ...nextTokens.dark } };
		} else {
			// new: start from the theme being worn, BOTH halves
			nextTokens = { light: { ...base }, dark: { ...base } };
			nextFork = { light: { ...base }, dark: { ...base } };
		}

		name = nextName;
		tokens = nextTokens;
		forkBase = nextFork;
		existingId = nextExisting;
	});

	/** LIVE preview: the draft paints over the stored theme for the mode
	 *  being edited; every effect re-run (a keystroke, a mode flip, live
	 *  off) and unmount first reverts to stored. Inline vars do not survive
	 *  a reload, so a hard close heals itself on the next paint. */
	$effect(() => {
		if (!live) return;
		const draft = tokens[editMode];
		const el = document.documentElement;
		for (const t of CORE_TOKENS) {
			const v = draft[t];
			if (v) el.style.setProperty(`--${t}`, v);
			else el.style.removeProperty(`--${t}`);
		}
		return () => reapplyThemeVars();
	});

	function setToken(tk: CoreToken, raw: string) {
		const v = raw.trim();
		const set = { ...tokens[editMode] };
		if (v) set[tk] = v;
		else delete set[tk];
		tokens = { ...tokens, [editMode]: set };
	}

	function save() {
		issues = [];
		const n = name.trim();
		if (!n) {
			issues = ['a name is required'];
			return;
		}
		const finalId = existingId ?? (`custom-${slugify(n)}` as const);
		if (!existingId && customThemes.items.some((t) => t.id === finalId)) {
			issues = [`a theme called "${n}" already exists — pick another name`];
			return;
		}
		try {
			const theme = validateCustomTheme({ id: finalId, name: n, tokens });
			saveCustomTheme(theme);
			setTheme(theme.id);
			void goto('/settings');
		} catch (e) {
			issues = e instanceof ThemeValidationError ? e.issues : ['could not save'];
		}
	}

	function copyJson() {
		void navigator.clipboard.writeText(
			JSON.stringify({ name: name || 'draft', tokens }, null, '\t')
		);
	}

	function resetToFork() {
		tokens = { light: { ...forkBase.light }, dark: { ...forkBase.dark } };
	}
</script>

<svelte:head>
	<title>Theme editor · mellon</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-7xl flex-col gap-4 py-4">
	<!-- The header: the name IS the title (the rename pattern — one field
	     less in the body), the secondary actions live in the ⋯, one primary
	     verb. No mismatched pill heights. -->
	<div class="flex items-center gap-2">
		<a
			href="/settings"
			aria-label="Back to settings"
			title="Back to settings"
			class="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-4" />
		</a>
		<label class="min-w-0 flex-1">
			<span class="sr-only">Theme name</span>
			<input
				bind:value={name}
				placeholder="name this theme"
				spellcheck="false"
				class="w-full truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 font-brand text-2xl font-semibold tracking-tight text-foreground transition-colors outline-none placeholder:text-muted-foreground/40 hover:border-border focus:border-brand"
			/>
		</label>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				aria-label="Theme draft actions"
				class="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
			>
				<Ellipsis class="size-4" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				side="bottom"
				align="end"
				class="w-44 rounded-lg border border-border p-1"
			>
				<DropdownMenu.Item
					class="rounded-md px-2 py-1.5 font-mono text-xs"
					onSelect={() => copyJson()}
				>
					<Copy class="mr-2 inline size-3.5" />
					Copy JSON
				</DropdownMenu.Item>
				<DropdownMenu.Item
					class="rounded-md px-2 py-1.5 font-mono text-xs"
					onSelect={() => resetToFork()}
				>
					<RotateCcw class="mr-2 inline size-3.5" />
					Reset to fork base
				</DropdownMenu.Item>
				<DropdownMenu.Separator class="my-1" />
				<!-- preview live rides here (the diff page's 'Changed only'
				     pattern): a checked menu item, not a form row — the
				     panes own the editing switch -->
				<DropdownMenu.CheckboxItem
					checked={live}
					onCheckedChange={(v) => {
						if (v !== undefined) live = v;
					}}
					closeOnSelect={false}
					class="rounded-md py-1.5 font-mono text-xs"
				>
					Preview live
				</DropdownMenu.CheckboxItem>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<Button type="button" variant="primary" onclick={save}>Save theme</Button>
	</div>

	<!-- the preview is the CO-STAR: half the editor, sticky, first on
	     mobile — and the panes ARE the editing switcher (click a pane to
	     edit that half); the live toggle lives in the ⋯ menu -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="order-1 flex flex-col gap-3 lg:order-2">
			<div class="flex flex-col gap-2 lg:sticky lg:top-4">
				{#each ['light', 'dark'] as m (m)}
					{@const pane = tokens[m as ThemeMode]}
					<button
						type="button"
						aria-pressed={editMode === m}
						aria-label="Edit the {m} half"
						onclick={() => (editMode = m as ThemeMode)}
						class="group rounded-xl border border-border p-2.5 text-left transition-shadow {editMode ===
						m
							? 'ring-1 ring-brand'
							: 'hover:border-brand/50'}"
						style={Object.entries(pane)
							.map(([k, v]) => `--${k}: ${v}`)
							.join('; ')}
					>
						<!-- a miniature of the portal, painted with the draft —
						     generic ANATOMY (top bar, card, verbs, markers, diff
						     bars), never named pages -->
						<div class="flex items-center gap-1.5 rounded-lg bg-chrome px-2.5 py-2">
							<span class="size-2 rounded-full bg-brand"></span>
							<span class="h-1.5 w-10 rounded-full bg-foreground/30"></span>
							<span class="ml-auto flex items-center gap-1">
								<span class="size-2 rounded-full bg-accent-blue/60"></span>
								<span class="size-2 rounded-full bg-accent-slate/60"></span>
							</span>
						</div>
						<div class="mt-2 rounded-lg border border-border bg-card p-3">
							<span class="block h-2 w-1/2 rounded-full bg-foreground/70"></span>
							<span class="mt-2 block h-1.5 w-5/6 rounded-full bg-foreground/35"></span>
							<span class="mt-1.5 block h-1.5 w-2/3 rounded-full bg-muted-foreground/40"></span>
							<div class="mt-3 flex items-center gap-2">
								<span class="rounded-full bg-brand px-2.5 py-1 text-[9px] font-medium text-white"
									>action</span
								>
								<span class="rounded-full bg-danger/10 px-2 py-1 text-[9px] text-danger"
									>danger</span
								>
								<span class="ml-auto h-5 w-24 rounded-md border border-border bg-background"></span>
							</div>
							<div class="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
								<span class="size-2 rounded-full bg-accent-amber"></span>
								<span class="h-1.5 flex-1 rounded-full bg-muted-foreground/30"></span>
							</div>
						</div>
						<div class="mt-2 flex items-center gap-1.5">
							<span class="size-2.5 rounded-full bg-accent-blue"></span>
							<span class="size-2.5 rounded-full bg-accent-teal"></span>
							<span class="size-2.5 rounded-full bg-accent-amber"></span>
							<span class="size-2.5 rounded-full bg-accent-slate"></span>
							<span class="ml-2 rounded bg-muted px-2 py-0.5 text-[9px] text-muted-foreground"
								>quiet ink on muted</span
							>
						</div>
						<div class="mt-2 flex flex-col gap-1">
							<span class="h-1.5 w-11/12 rounded-full bg-diff-add/30"></span>
							<span class="h-1.5 w-3/4 rounded-full bg-diff-del/30"></span>
						</div>
						<div class="mt-2 flex items-center justify-between">
							<span class="font-mono text-[10px] text-muted-foreground">{m}</span>
							<span
								class="rounded-full px-2 py-0.5 font-mono text-[9px] {editMode === m
									? 'bg-brand/15 text-foreground'
									: 'text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100'}"
							>
								{editMode === m ? 'editing' : 'click to edit'}
							</span>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- the token rail: named colors with swatches — the picker is the
		     only editor; the token name demotes to a subtitle -->
		<div class="order-2 flex flex-col gap-5 lg:order-1">
			<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
				pick a color to change it — leave it alone to keep the one you started from
			</p>
			{#each SECTIONS as s (s.title)}
				<div class="flex flex-col gap-2">
					<div>
						<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
							{s.title}
						</p>
						<p class="text-xs text-muted-foreground/60">{s.hint}</p>
					</div>
					<div class="flex flex-col gap-1.5">
						{#each s.tokens as tk (tk)}
							{@const v = tokens[editMode][tk]}
							<div
								class="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
							>
								<Popover.Root
									open={openToken === tk}
									onOpenChange={(o) => (openToken = o ? tk : null)}
								>
									<Popover.Trigger
										aria-label="Pick {LABELS[tk].label}"
										title={v ?? 'inherited'}
										class="color-checkerboard size-8 shrink-0 cursor-pointer rounded-lg border border-border transition-transform group-hover:scale-105"
										style={`background-color: ${v ?? 'transparent'}`}
									></Popover.Trigger>
									<Popover.Content
										class="w-auto gap-2 rounded-lg bg-popover p-3 shadow-2xl ring-1 ring-foreground/10"
									>
										<ColorPicker
											value={v ?? ''}
											themeSwatches={swatchesFor(tk)}
											{recents}
											onRemember={rememberColor}
											onInput={(hex) => setToken(tk, hex)}
										/>
									</Popover.Content>
								</Popover.Root>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm text-foreground">{LABELS[tk].label}</p>
									<p class="truncate font-mono text-[10px] text-muted-foreground/50">
										{LABELS[tk].hint} · --{tk}
									</p>
								</div>
								<span class="shrink-0 font-mono text-[10px] text-muted-foreground">
									{v ?? 'inherited'}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	{#if issues.length}
		<ul class="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger/5 p-2" role="alert">
			{#each issues as issue (issue)}
				<li class="font-mono text-xs text-danger">{issue}</li>
			{/each}
		</ul>
	{/if}
</section>
