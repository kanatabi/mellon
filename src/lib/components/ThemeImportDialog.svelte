<script lang="ts">
	// The theme import door (the theming round 2): paste or upload a theme
	// as JSON (the native format) or as a shadcn-style CSS variables block
	// (parsed via a DETACHED stylesheet — only custom-property declarations
	// of the CORE grammar are lifted; the rest of the file is discarded, so
	// arbitrary CSS never applies). Gaps in the file inherit the theme
	// you're wearing right now (the one-click "fill from current").
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { CORE_TOKENS, type CoreTokens } from '#lib/theme-registry.ts';
	import {
		assembleTheme,
		parseThemeCss,
		parseThemeJson,
		ThemeValidationError,
		type CustomTheme,
		type PartialTokens
	} from '#lib/custom-theme.ts';
	import type { ThemeMode } from '#lib/theme.ts';

	interface Props {
		onImported: (theme: CustomTheme) => void;
		onClose: () => void;
	}

	let { onImported, onClose }: Props = $props();

	let open = $state(true);
	let text = $state('');
	let name = $state('');
	let issues = $state<string[]>([]);
	let fileInput = $state<HTMLInputElement | undefined>();

	/** The gap-fill base: the CURRENT theme's computed values, as worn. */
	function fillFromCurrent(): Record<ThemeMode, Partial<CoreTokens>> {
		const cs = getComputedStyle(document.documentElement);
		const out: Record<ThemeMode, Partial<CoreTokens>> = { light: {}, dark: {} };
		for (const mode of ['light', 'dark'] as const) {
			for (const t of CORE_TOKENS) {
				const v = cs.getPropertyValue(`--${t}`).trim();
				if (v) out[mode][t] = v;
			}
		}
		return out;
	}

	async function readFile(files: FileList | File[]) {
		const f = files[0];
		if (f) text = await f.text();
	}

	function doImport() {
		issues = [];
		const t = text.trim();
		if (!t) {
			issues = ['nothing pasted yet'];
			return;
		}
		const json = parseThemeJson(t);
		let partial: PartialTokens;
		let parsedName = '';
		if (json) {
			partial = json.partial;
			parsedName = json.name;
		} else {
			partial = parseThemeCss(t).partial;
		}
		if (!name && parsedName) name = parsedName;
		const finalName = (name || parsedName || '').trim() || 'imported theme';
		try {
			onImported(assembleTheme(finalName, partial, fillFromCurrent()));
		} catch (e) {
			issues = e instanceof ThemeValidationError ? e.issues : ['could not parse that theme'];
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) onClose();
	}}
>
	<Dialog.Content class="max-w-lg rounded-lg border-0 bg-card p-5 shadow-2xl">
		<Dialog.Header>
			<Dialog.Title class="text-lg font-semibold">Import a theme</Dialog.Title>
			<Dialog.Description class="font-mono text-xs text-muted-foreground">
				paste JSON or a CSS variables block — gaps inherit the theme you're wearing
			</Dialog.Description>
		</Dialog.Header>
		<form
			class="flex flex-col gap-3 pt-1"
			onsubmit={(e) => {
				e.preventDefault();
				doImport();
			}}
		>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
					>name</span
				>
				<Input bind:value={name} placeholder="imported theme" />
			</label>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
					>theme file or paste</span
				>
				<textarea
					bind:value={text}
					rows="8"
					class="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
					placeholder={`{"name": "midnight", "tokens": {"light": {…}, "dark": {…}}}`}></textarea>
			</label>
			<div class="flex items-center gap-2">
				<Button type="button" variant="quiet" onclick={() => fileInput?.click()}>
					upload a file…
				</Button>
				<input
					type="file"
					accept=".json,.css,text/plain"
					class="sr-only"
					bind:this={fileInput}
					onchange={(e) => {
						if (e.currentTarget.files?.length) void readFile(e.currentTarget.files);
						e.currentTarget.value = '';
					}}
				/>
			</div>
			{#if issues.length}
				<ul class="flex flex-col gap-1" role="alert">
					{#each issues as issue (issue)}
						<li class="font-mono text-xs text-danger">{issue}</li>
					{/each}
				</ul>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="quiet" onclick={onClose}>Cancel</Button>
				<Button type="submit" variant="primary">Import</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
