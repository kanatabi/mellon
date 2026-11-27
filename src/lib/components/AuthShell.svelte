<script lang="ts">
	import type { Snippet } from 'svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { toggleMode, themeState } from '#lib/theme-state.svelte.ts';

	/**
	 * The auth gate's shared shell (2026-11-28): the login and setup pages are
	 * one card — FORM RIGHT, visual panel left. The panel is decorative
	 * (aria-hidden): a token-driven aurora, a grain + ASCII texture and a
	 * floating "console" postcard of INVENTED rows. No API, no real values.
	 *
	 * Motion is Level 3 (owner call): aurora drift + glass bob + glyph drift +
	 * desktop pointer parallax. Everything animates transform/opacity only;
	 * prefers-reduced-motion freezes a composed static frame.
	 */
	interface Props {
		title: string;
		subtitle: string;
		children: Snippet;
	}

	let { title, subtitle, children }: Props = $props();

	let visualEl: HTMLElement | null = $state(null);
	let raf = 0;

	function onVisualMove(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || !visualEl) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
		const { clientX, clientY } = e;
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			if (!visualEl) return;
			const r = visualEl.getBoundingClientRect();
			const x = ((clientX - r.left) / r.width - 0.5) * 2;
			const y = ((clientY - r.top) / r.height - 0.5) * 2;
			visualEl.style.setProperty('--mx', x.toFixed(3));
			visualEl.style.setProperty('--my', y.toFixed(3));
		});
	}

	function resetVisual() {
		visualEl?.style.setProperty('--mx', '0');
		visualEl?.style.setProperty('--my', '0');
	}

	$effect(() => {
		return () => {
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<section
	class="relative flex flex-1 items-center justify-center overflow-hidden bg-chrome px-4 py-6 sm:px-6 lg:py-10"
>
	<div class="auth-page-glow" aria-hidden="true"></div>

	<div
		class="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:grid-cols-[1.08fr_1fr]"
	>
		<!-- VISUAL (left; desktop only). Decorative from top to bottom. -->
		<div
			bind:this={visualEl}
			onpointermove={onVisualMove}
			onpointerleave={resetVisual}
			class="auth-visual relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between"
			aria-hidden="true"
		>
			<div class="auth-parallax"></div>
			<div class="auth-glyphs"></div>
			<div class="auth-grain"></div>

			<div class="relative z-10 flex items-center gap-2">
				<span class="size-1.5 rounded-full bg-white/80"></span>
				<span class="font-mono text-[10px] tracking-[0.22em] text-white/70 uppercase">
					the estate · one door
				</span>
			</div>

			<div class="auth-float relative z-10 mx-auto w-full max-w-[19rem]">
				<div class="auth-glass">
					<div class="flex items-center justify-between gap-3 border-b border-white/15 pb-2.5">
						<span class="font-mono text-[10px] tracking-widest text-white/50 uppercase"
							>workspace</span
						>
						<span class="font-mono text-[10px] text-white/70">production</span>
					</div>
					<div class="mt-2.5 flex items-center justify-between gap-3 font-mono text-[11px]">
						<span class="text-white/55">api_key</span>
						<span class="tracking-[0.2em] text-white/80">••••••••</span>
					</div>
					<div class="mt-1.5 flex items-center justify-between gap-3 font-mono text-[11px]">
						<span class="text-white/55">session_secret</span>
						<span class="tracking-[0.2em] text-white/80">••••••••</span>
					</div>
					<div
						class="mt-3 flex items-center justify-between gap-3 border-t border-white/15 pt-2.5 font-mono text-[11px]"
					>
						<span class="flex min-w-0 items-center gap-2">
							<span
								class="grid size-3.5 shrink-0 place-items-center rounded-sm border border-white/40 text-[8px] text-white/90"
								>✓</span
							>
							<span class="truncate text-white/80">Review the release</span>
						</span>
						<span
							class="shrink-0 rounded-sm border border-white/25 px-1.5 py-0.5 text-[9px] tracking-widest text-white/70 uppercase"
							>high</span
						>
					</div>
					<div class="mt-1.5 flex items-center justify-between gap-3 font-mono text-[11px]">
						<span class="truncate text-white/70">Imported draft</span>
						<span class="shrink-0 text-white/45">rev 5</span>
					</div>
				</div>
			</div>

			<div class="relative z-10">
				<p
					class="font-brand text-4xl leading-[1.05] font-semibold tracking-tight text-white xl:text-5xl"
				>
					Speak, friend,<br />and enter.
				</p>
				<p class="mt-4 max-w-[19rem] text-sm leading-relaxed text-white/70">
					The blog, the vault, and the work — one console for the whole estate.
				</p>
				<p class="mt-4 font-mono text-[10px] tracking-widest text-white/40 uppercase">
					— J. R. R. Tolkien
				</p>
			</div>
		</div>

		<!-- FORM (right). The only interactive side; theming stays token-native. -->
		<div class="relative flex flex-col p-6 sm:p-10 lg:p-12">
			<div class="auth-strip absolute inset-x-0 top-0 h-1 lg:hidden" aria-hidden="true"></div>

			<header class="flex items-center justify-between gap-4">
				<span class="font-brand text-2xl leading-none font-semibold tracking-tight"> mellon; </span>
				<ThemeToggle mode={themeState.mode} onToggle={toggleMode} />
			</header>

			<div class="flex flex-1 flex-col justify-center py-8 sm:py-10">
				<div class="mx-auto w-full max-w-sm">
					<h1 class="font-brand text-4xl font-semibold tracking-tight">{title}</h1>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
					<div class="mt-8">{@render children()}</div>
				</div>
			</div>

			<p
				class="text-center font-mono text-[10px] tracking-widest text-muted-foreground/50 uppercase"
			>
				mellon · the estate console
			</p>
		</div>
	</div>
</section>
