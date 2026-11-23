<script lang="ts">
	import { ArrowLeft, Copy, RotateCcw } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import { CORE_TOKENS, type CoreToken } from '#lib/theme-registry.ts';
	import { slugify, ThemeValidationError, validateCustomTheme } from '#lib/custom-theme.ts';
	import { customThemes, getCustomTheme, saveCustomTheme } from '#lib/custom-themes.svelte.ts';
	import { reapplyThemeVars, setTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { computedTokens, readThemeTokens } from '#lib/theme-css.ts';
	import type { ThemeId, ThemeMode } from '#lib/theme.ts';

	// The theme editor (the theming round 3): the draft is a NAME + both
	// modes' token maps; the LIVE preview paints the draft over the real
	// app through the apply seam and REVERTS on every change and unmount —
	// the draft never persists unless Save says so. The seed:
	//   custom-<id>  → the stored body (editing it in place)
	//   ?fork=<id>   → that built-in's TWO blocks read out of our own CSS
	//   new          → the theme you're wearing, both halves (tweak-first)
	const { id } = $derived(page.params);
	const forkId = $derived(page.url.searchParams.get('fork'));

	type Draft = {
		light: Partial<Record<CoreToken, string>>;
		dark: Partial<Record<CoreToken, string>>;
	};

	let name = $state('');
	let tokens = $state<Draft>({ light: {}, dark: {} });
	let forkBase = $state<Draft>({ light: {}, dark: {} });
	let computedBase = $state<Partial<Record<CoreToken, string>>>({});
	let editMode = $state<ThemeMode>('light');
	let filter = $state('');
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

	const SECTIONS: { title: string; tokens: CoreToken[] }[] = [
		{
			title: 'surfaces',
			tokens: [
				'background',
				'foreground',
				'card',
				'muted',
				'muted-foreground',
				'accent',
				'border',
				'chrome'
			]
		},
		{
			title: 'accents',
			tokens: ['brand', 'accent-blue', 'accent-teal', 'accent-amber', 'accent-slate']
		},
		{ title: 'danger', tokens: ['danger'] },
		{ title: 'diff', tokens: ['diff-add', 'diff-del'] }
	];

	function matches(tk: CoreToken): boolean {
		return !filter || tk.includes(filter.toLowerCase());
	}

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

		computedBase = base;
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
</script>

<svelte:head>
	<title>Theme editor · mellon</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
	<div class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			<a
				href="/settings"
				aria-label="Back to settings"
				title="Back to settings"
				class="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft class="size-4" />
			</a>
			<h1 class="font-brand text-2xl font-semibold tracking-tight">Theme editor</h1>
		</div>
		<div class="flex items-center gap-2">
			<Button type="button" variant="quiet" onclick={copyJson} title="Copy the draft as JSON">
				<Copy class="size-3.5" />
				Copy JSON
			</Button>
			<Button type="button" variant="primary" onclick={save}>Save theme</Button>
		</div>
	</div>

	<div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<label class="flex w-64 flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
					>name</span
				>
				<Input bind:value={name} placeholder="midnight ink" />
			</label>
			<div
				class="flex w-fit gap-1 rounded-full border border-border bg-background p-1"
				role="radiogroup"
				aria-label="Editing"
			>
				{#each ['light', 'dark'] as m (m)}
					<button
						type="button"
						role="radio"
						aria-checked={editMode === m}
						onclick={() => (editMode = m as ThemeMode)}
						class="rounded-full px-3 py-1 font-mono text-xs transition-colors {editMode === m
							? 'bg-brand/15 text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{m}
					</button>
				{/each}
			</div>
			<label class="flex items-center gap-2 font-mono text-xs text-muted-foreground">
				<input type="checkbox" bind:checked={live} class="accent-[var(--brand)]" />
				preview live (the draft paints the whole app; leaving reverts)
			</label>
		</div>
		<p class="font-mono text-[10px] text-muted-foreground/70">
			unset rows inherit the seed base (shown as the placeholder) — the preview always shows the
			{editMode} half you are editing
		</p>
		{#if issues.length}
			<ul
				class="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger/5 p-2"
				role="alert"
			>
				{#each issues as issue (issue)}
					<li class="font-mono text-xs text-danger">{issue}</li>
				{/each}
			</ul>
		{/if}
		<div class="flex items-center gap-2">
			<Input bind:value={filter} placeholder="filter tokens…" class="max-w-56" />
			<Button
				type="button"
				variant="quiet"
				onclick={() => {
					tokens = { light: { ...forkBase.light }, dark: { ...forkBase.dark } };
				}}
				title="Reset both halves to the fork base"
			>
				<RotateCcw class="size-3.5" />
				Reset to fork base
			</Button>
		</div>

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
			<!-- the token rail -->
			<div class="flex flex-col gap-4">
				{#each SECTIONS as s (s.title)}
					{@const rows = s.tokens.filter(matches)}
					{#if rows.length}
						<div class="flex flex-col gap-1.5">
							<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
								{s.title}
							</p>
							{#each rows as tk (tk)}
								{@const v = tokens[editMode][tk]}
								<div class="flex items-center gap-2">
									<span class="w-36 shrink-0 truncate font-mono text-[10px] text-muted-foreground"
										>--{tk}</span
									>
									<input
										value={v ?? ''}
										placeholder={forkBase[editMode][tk] ?? computedBase[tk] ?? 'unset'}
										oninput={(e) => setToken(tk, e.currentTarget.value)}
										spellcheck="false"
										class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-brand"
									/>
									<!-- the picker chip: ONE popover open at a time (the
									     page's openToken — clicking another chip closes
									     this one); Esc/outside close and null it. The
									     chip paints the value ITSELF (CSS renders hex
									     AND oklch natively) over a checkerboard. -->
									<Popover.Root
										open={openToken === tk}
										onOpenChange={(o) => (openToken = o ? tk : null)}
									>
										<Popover.Trigger
											aria-label="Pick {tk}"
											title={v ?? 'unset'}
											class="color-checkerboard size-7 shrink-0 cursor-pointer rounded border border-border"
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
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>

			<!-- the preview: the draft's two halves as swatch panes -->
			<div class="flex flex-col gap-2">
				<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
					preview
				</p>
				{#each ['light', 'dark'] as m (m)}
					{@const pane = tokens[m as ThemeMode]}
					<div
						class="flex flex-col gap-2 rounded-lg border border-border p-2 {editMode === m
							? 'ring-1 ring-brand'
							: ''}"
						style={Object.entries(pane)
							.map(([k, v]) => `--${k}: ${v}`)
							.join('; ')}
					>
						<span class="font-mono text-[10px] text-muted-foreground">{m}</span>
						<div class="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2">
							<span class="h-2 w-3/4 rounded-full bg-foreground/70"></span>
							<span class="h-2 w-1/2 rounded-full bg-muted-foreground/40"></span>
							<span class="mt-1 flex items-center gap-1.5">
								<span class="h-3 w-8 rounded-full bg-brand"></span>
								<span class="size-2 rounded-full bg-danger"></span>
								<span class="size-2 rounded-full bg-accent-amber"></span>
							</span>
							<span class="rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground"
								>muted text on muted</span
							>
						</div>
					</div>
				{/each}
				<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
					editor: {themeState.theme}-{themeState.mode} is the theme being worn; the
					{editMode} half is being edited{live ? ' and painted live' : ''}
				</p>
			</div>
		</div>
	</div>
</section>
