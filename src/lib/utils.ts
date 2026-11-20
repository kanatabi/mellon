import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class merge — tailwind-aware: the last conflicting utility wins, which is
 * what makes vendored `class={cn(defaults, className)}` overrides behave.
 *
 * SHADCN.md §3.4 / D8: implemented here rather than adding the registry's
 * `cn` package — one dependency we can read, instead of one we can't.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/* The type helpers the vendored files import. Copied verbatim from the
   registry's `utils` item — they are structural (`child`/`children` snippets,
   bindable refs), so a divergence would be a compile error in `ui/`, not a
   silent drift. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
