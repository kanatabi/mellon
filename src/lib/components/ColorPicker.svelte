<script lang="ts">
	// The portal-authored color picker (the editor's picker follow-up, the
	// Figma reference): Grid mosaic / Spectrum square / Sliders tabs, a
	// shared opacity bar, and a swatch row of the theme's own values +
	// recents. The picker works in HSV internally and WRITES HEX (alpha
	// below 100% earns #rrggbbaa); an unparsable token value keeps its raw
	// string — the picker never writes until the user picks. Rides the
	// house Popover (the page owns open/close; single-open is the page's
	// openToken).
	import { Plus, X } from 'lucide-svelte';
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { gridMosaic, hsvToRgb, parseColor, rgbToHex, rgbToHsv, type Hsv } from '#lib/color.ts';

	interface Props {
		/** The token's current value — seeds the picker when it opens. */
		value: string;
		/** The draft's OTHER token values — the harmonizing presets. */
		themeSwatches?: string[];
		/** Recently picked (page-owned; shared across the editor). */
		recents?: string[];
		/** Save the current color into the recents. */
		onRemember: (hex: string) => void;
		onInput: (hex: string) => void;
	}

	let { value, themeSwatches = [], recents = [], onRemember, onInput }: Props = $props();

	const mosaic = gridMosaic().map((column) => column.map((c) => rgbToHex(hsvToRgb(c))));

	let tab = $state<'grid' | 'spectrum' | 'sliders'>('grid');
	let hsv = $state<Hsv>({ h: 258, s: 0.8, v: 0.65 });
	let alpha = $state(1);
	let svEl = $state<HTMLDivElement | undefined>();
	let hueEl = $state<HTMLDivElement | undefined>();
	let alphaEl = $state<HTMLDivElement | undefined>();

	// seed from the value each time the picker mounts (the popover mounts
	// fresh per open); an unparsable value keeps the default HSV — the raw
	// string stays untouched until a real pick
	$effect(() => {
		const p = parseColor(value);
		if (p) {
			hsv = rgbToHsv(p);
			alpha = p.a;
		}
	});

	const currentHex = $derived(rgbToHex(hsvToRgb(hsv)));
	const currentHexA = $derived(rgbToHex(hsvToRgb(hsv), alpha));

	function emit() {
		onInput(rgbToHex(hsvToRgb(hsv), alpha));
	}

	const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

	function pickCell(hex: string) {
		const p = parseColor(hex);
		if (p) {
			hsv = rgbToHsv(p);
			alpha = 1;
			emit();
			onRemember(rgbToHex(hsvToRgb(hsv)));
		}
	}

	function pickSwatch(raw: string) {
		const p = parseColor(raw);
		if (p) {
			hsv = rgbToHsv(p);
			alpha = p.a;
			emit();
			onRemember(rgbToHex(hsvToRgb(hsv)));
		}
	}

	function svPoint(e: PointerEvent) {
		if (!svEl) return;
		const r = svEl.getBoundingClientRect();
		hsv = {
			...hsv,
			s: clamp01((e.clientX - r.left) / r.width),
			v: 1 - clamp01((e.clientY - r.top) / r.height)
		};
		emit();
	}

	function huePoint(e: PointerEvent) {
		if (!hueEl) return;
		const r = hueEl.getBoundingClientRect();
		hsv = { ...hsv, h: clamp01((e.clientX - r.left) / r.width) * 360 };
		emit();
	}

	function alphaPoint(e: PointerEvent) {
		if (!alphaEl) return;
		const r = alphaEl.getBoundingClientRect();
		// the thumb's travel is inset by its 8px radius — the mapping must
		// agree, or the ends click at the wrong alpha
		const travel = r.width - 16;
		if (travel <= 0) return;
		alpha = clamp01((e.clientX - r.left - 8) / travel);
		emit();
	}

	function commitRecent() {
		onRemember(currentHex);
	}

	function fromHexText(raw: string) {
		const p = parseColor(raw);
		if (p) {
			hsv = rgbToHsv(p);
			alpha = p.a;
			emit();
			commitRecent();
		}
	}
</script>

<div class="flex w-72 flex-col gap-2 font-sans">
	<div class="flex items-center justify-between">
		<span class="text-xs font-medium text-foreground">Colors</span>
		<PopoverPrimitive.Close
			aria-label="Close the color picker"
			class="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
		>
			<X class="size-3.5" />
		</PopoverPrimitive.Close>
	</div>

	<div class="flex w-fit rounded-lg border border-border bg-muted p-0.5">
		{#each ['grid', 'spectrum', 'sliders'] as t (t)}
			<button
				type="button"
				aria-pressed={tab === t}
				onclick={() => (tab = t as typeof tab)}
				class="rounded-md px-2.5 py-1 font-mono text-[10px] transition-colors {tab === t
					? 'bg-card text-foreground ring-1 ring-border'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				{t}
			</button>
		{/each}
	</div>

	{#if tab === 'grid'}
		<!-- the mosaic: grayscale strip, then 12 hue columns (column-major) -->
		<div class="overflow-hidden rounded-md border border-border">
			<div class="grid grid-cols-10">
				{#each mosaic[0] as hex (hex)}
					<button
						type="button"
						class="aspect-square"
						style={`background-color: ${hex}`}
						aria-label="Pick {hex}"
						onclick={() => pickCell(hex)}
					></button>
				{/each}
			</div>
			<div class="grid grid-flow-col grid-cols-12 grid-rows-8">
				{#each mosaic.slice(1) as column, ci (ci)}
					{#each column as hex (hex)}
						<button
							type="button"
							class="aspect-square"
							style={`background-color: ${hex}`}
							aria-label="Pick {hex}"
							onclick={() => pickCell(hex)}
						></button>
					{/each}
				{/each}
			</div>
		</div>
	{:else if tab === 'spectrum'}
		<!-- the SV square: hue fill + white/black gradient layers, pointer-drag -->
		<div
			bind:this={svEl}
			class="relative h-40 cursor-crosshair touch-none overflow-hidden rounded-md border border-border"
			style={`background-color: hsl(${hsv.h} 100% 50%)`}
			role="slider"
			aria-label="Saturation and brightness"
			aria-valuenow={Math.round(hsv.s * 100)}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
			tabindex="0"
			onpointerdown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				svPoint(e);
			}}
			onpointermove={(e) => {
				if (e.buttons & 1) svPoint(e);
			}}
			onpointerup={commitRecent}
			onkeydown={(e) => {
				const step = 0.05;
				const s =
					e.key === 'ArrowLeft'
						? clamp01(hsv.s - step)
						: e.key === 'ArrowRight'
							? clamp01(hsv.s + step)
							: hsv.s;
				const v =
					e.key === 'ArrowDown'
						? clamp01(hsv.v - step)
						: e.key === 'ArrowUp'
							? clamp01(hsv.v + step)
							: hsv.v;
				if (s !== hsv.s || v !== hsv.v) {
					e.preventDefault();
					hsv = { ...hsv, s, v };
					emit();
				}
			}}
		>
			<div
				class="absolute inset-0"
				style="background: linear-gradient(to right, #fff, transparent)"
			></div>
			<div
				class="absolute inset-0"
				style="background: linear-gradient(to top, #000, transparent)"
			></div>
			<div
				class="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white shadow-md"
				style={`left: ${hsv.s * 100}%; top: ${(1 - hsv.v) * 100}%`}
			></div>
		</div>
		<div
			bind:this={hueEl}
			class="relative h-3 cursor-pointer touch-none rounded-full"
			style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
			role="slider"
			aria-label="Hue"
			aria-valuenow={Math.round(hsv.h)}
			aria-valuemin={0}
			aria-valuemax={360}
			aria-valuetext={`hue ${Math.round(hsv.h)} degrees`}
			tabindex="0"
			onpointerdown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				huePoint(e);
			}}
			onpointermove={(e) => {
				if (e.buttons & 1) huePoint(e);
			}}
			onpointerup={commitRecent}
			onkeydown={(e) => {
				const step = 5;
				const h =
					e.key === 'ArrowLeft' ? hsv.h - step : e.key === 'ArrowRight' ? hsv.h + step : hsv.h;
				if (h !== hsv.h) {
					e.preventDefault();
					hsv = { ...hsv, h };
					emit();
				}
			}}
		>
			<div
				class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
				style={`left: ${(hsv.h / 360) * 100}%; background-color: hsl(${hsv.h} 100% 50%)`}
			></div>
		</div>
	{:else}
		<!-- the precision tab: H/S/V sliders + the hex field -->
		<div class="flex flex-col gap-2">
			{#each [[hsv.h, 'hue', 360], [hsv.s * 100, 'saturation', 100], [hsv.v * 100, 'brightness', 100]] as [v, label, max], i (label)}
				<label class="flex items-center gap-2">
					<span class="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">{label}</span>
					<input
						type="range"
						min="0"
						{max}
						step="1"
						value={Math.round(v as number)}
						oninput={(e) => {
							const n = Number(e.currentTarget.value);
							hsv =
								i === 0
									? { ...hsv, h: n }
									: i === 1
										? { ...hsv, s: n / 100 }
										: { ...hsv, v: n / 100 };
							emit();
						}}
						onchange={commitRecent}
						class="min-w-0 flex-1 accent-brand"
					/>
				</label>
			{/each}
			<label class="flex items-center gap-2">
				<span class="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">hex</span>
				<input
					value={currentHexA}
					onchange={(e) => fromHexText(e.currentTarget.value)}
					spellcheck="false"
					class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-brand"
				/>
			</label>
		</div>
	{/if}

	<!-- the opacity slider IS the indicator: ONE track — checkerboard
	     under the color's own gradient — with the thumb riding it (the
	     hue-bar pattern; arrow keys step 5%) -->
	<div class="flex items-center gap-2">
		<span class="w-16 shrink-0 font-mono text-[10px] text-muted-foreground uppercase">opacity</span>
		<div
			bind:this={alphaEl}
			class="color-checkerboard relative h-4 min-w-0 flex-1 cursor-pointer touch-none rounded-full border border-border"
			role="slider"
			aria-label="Opacity"
			aria-valuenow={Math.round(alpha * 100)}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuetext={`opacity ${Math.round(alpha * 100)}%`}
			tabindex="0"
			onpointerdown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				alphaPoint(e);
			}}
			onpointermove={(e) => {
				if (e.buttons & 1) alphaPoint(e);
			}}
			onpointerup={commitRecent}
			onkeydown={(e) => {
				const a =
					e.key === 'ArrowLeft' ? alpha - 0.05 : e.key === 'ArrowRight' ? alpha + 0.05 : alpha;
				if (a !== alpha) {
					e.preventDefault();
					alpha = clamp01(a);
					emit();
				}
			}}
		>
			<div
				class="absolute inset-0 overflow-hidden rounded-full"
				style={`background: linear-gradient(to right, ${currentHex}00, ${currentHex})`}
			></div>
			<!-- the thumb travels INSET by its own radius — at 0% and 100%
			     it kisses the ends instead of being swallowed (the track's
			     overflow-hidden moved to the gradient child, so the 20px
			     thumb can overhang the 16px track vertically like the hue
			     bar's does) -->
			<div
				class="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
				style={`left: calc(8px + ${alpha} * (100% - 16px)); background-color: ${currentHex}`}
			></div>
		</div>
		<span class="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground"
			>{Math.round(alpha * 100)}%</span
		>
	</div>

	<!-- the swatches: TWO labeled lines (the owner's read: one wrapped
	     row made every swatch look like a recent) — the theme's own
	     values first, the current ringed; the recents below, the
	     remember-+ at the END of their line -->
	<div class="flex flex-col gap-1.5">
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="w-16 shrink-0 font-mono text-[10px] text-muted-foreground uppercase">theme</span>
			<span
				class="color-checkerboard block size-7 shrink-0 rounded-full ring-1 ring-brand"
				title={`current: ${currentHexA}`}
			>
				<span class="block size-full rounded-full" style={`background-color: ${currentHexA}`}
				></span>
			</span>
			{#each themeSwatches.slice(0, 10) as s, i (s + i)}
				<button
					type="button"
					class="size-7 shrink-0 rounded-full ring-1 ring-border/50 transition-shadow ring-inset hover:ring-2 hover:ring-brand"
					style={`background-color: ${s}`}
					aria-label="Use {s}"
					title={s}
					onclick={() => pickSwatch(s)}
				></button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="w-16 shrink-0 font-mono text-[10px] text-muted-foreground uppercase">recent</span
			>
			{#each recents.slice(0, 8) as r, i (r + i)}
				<button
					type="button"
					class="size-7 shrink-0 rounded-full ring-1 ring-border/50 transition-shadow ring-inset hover:ring-2 hover:ring-brand"
					style={`background-color: ${r}`}
					aria-label="Use recent {r}"
					title={r}
					onclick={() => pickSwatch(r)}
				></button>
			{/each}
			<button
				type="button"
				class="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground"
				aria-label="Remember the current color"
				title="Remember the current color"
				onclick={commitRecent}
			>
				<Plus class="size-3" />
			</button>
		</div>
	</div>
</div>
