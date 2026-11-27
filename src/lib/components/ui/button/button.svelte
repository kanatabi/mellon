<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			// size BEFORE variant: tv emits in definition order, and the cast's
			// pill paddings + h-auto must override the registry's h-8/px-2.5 when
			// a cast variant rides the default size (proven in the eval probe).
			// RADIUS LIVES ON THE SIZE, never the base: Tailwind's radius
			// utilities are ordered by scale, so a base `rounded-lg` would beat
			// a variant's `rounded-md` regardless of class order. One radius
			// class per button keeps the shape deterministic.
			size: {
				default:
					'h-8 gap-1.5 rounded-md px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				xs: "h-6 gap-1 rounded-sm px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				lg: 'h-9 gap-1.5 rounded-md px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				icon: 'size-8 rounded-md',
				'icon-xs': "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7 rounded-md',
				'icon-lg': 'size-9 rounded-md'
			},
			variant: {
				// ── mellon's cast (the 2026-11-27 Linear round): the pill was
				// retired. Controls are 6px rectangles (rounded-md), tags are
				// 4px (rounded-sm), full circles stay reserved for avatars and
				// count badges. Colors remain SEMANTIC tokens — `text-primary-
				// foreground` (not text-white) keeps contrast correct on the
				// light-brand dark themes.
				primary:
					'h-auto bg-brand px-4 py-2 text-primary-foreground transition-colors hover:bg-brand/90 active:translate-y-0 disabled:opacity-70',
				quiet:
					// D14 (2026-11-21, owner: "I don't like this kind of button"): the
					// transparent text-chip read as bare text on any surface. The
					// quiet chip gains the PICKER SURFACE — bg-card + the border,
					// the select-trigger's anatomy — so a secondary action reads
					// as a control everywhere it sits.
					'h-auto border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground',
				danger:
					'h-auto border-danger/40 px-3 py-1.5 font-mono text-xs text-danger transition-colors hover:bg-danger/10',
				soft: 'h-auto rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground',
				default: 'bg-primary text-primary-foreground hover:bg-primary/80',
				outline:
					'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
				ghost:
					'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground',
				destructive:
					'bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30',
				link: 'text-primary underline-offset-4 hover:underline'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
