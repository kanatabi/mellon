/**
 * The color math for the theme editor's picker (the theming round's
 * picker follow-up). PURE — node-testable, no DOM. Three jobs:
 *
 *   1. hex ↔ rgb ↔ hsv — the drag surface and sliders work in HSV, the
 *      wire writes hex.
 *   2. oklch ↔ srgb — the portal's tokens are often oklch, so the picker
 *      must round-trip them (the OKLab matrices, clamped); without this
 *      every oklch token opens on a gray guess.
 *   3. parse/format — `parseColor` recognizes the value shapes the token
 *      grammar allows (hex 3–8 digits, rgb()/rgba(), oklch() with optional
 *      alpha) and answers null for anything else (an unparsed value is
 *      shown as-is; the picker never writes until the user picks).
 *
 * sRGB→linear→LMS→OKLab matrices from the OKLab spec (B. Fitzpatrick /
 * css-color); rounding is rounding — round-trips are asserted to ±2/255.
 */

export interface Rgb {
	r: number; // 0–255
	g: number;
	b: number;
}
export interface Hsv {
	h: number; // 0–360
	s: number; // 0–1
	v: number; // 0–1
}
export interface Oklch {
	l: number; // 0–1
	c: number; // 0–~0.4
	h: number; // 0–360
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/* ── hex ─────────────────────────────────────────────────────────────── */

/** `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` → rgb (alpha 0–1), or null. */
export function parseHex(value: string): (Rgb & { a: number }) | null {
	const m = /^#([0-9a-fA-F]{3,8})$/.exec(value.trim());
	if (!m) return null;
	const h = m[1];
	if (h.length === 3 || h.length === 4) {
		const [r, g, b, a] = [...h].map((c) => Number.parseInt(c + c, 16));
		return { r, g, b, a: a === undefined ? 1 : a / 255 };
	}
	if (h.length === 6 || h.length === 8) {
		const n = Number.parseInt(h, 16);
		const r = (n >>> (h.length === 8 ? 24 : 16)) & 255;
		const g = (n >>> (h.length === 8 ? 16 : 8)) & 255;
		const b = (n >>> (h.length === 8 ? 8 : 0)) & 255;
		const a = h.length === 8 ? (n & 255) / 255 : 1;
		return { r, g, b, a };
	}
	return null;
}

export function rgbToHex({ r, g, b }: Rgb, a = 1): string {
	const byte = (x: number) =>
		Math.round(clamp01(x / 255) * 255)
			.toString(16)
			.padStart(2, '0');
	const base = `#${byte(r)}${byte(g)}${byte(b)}`;
	// 255/254 alpha rounds to 1 — only a real transparency earns the 8-digit form
	const aByte = Math.round(clamp01(a) * 255);
	return aByte >= 254 ? base : `${base}${aByte.toString(16).padStart(2, '0')}`;
}
/* ── hsv ─────────────────────────────────────────────────────────────── */

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
	const R = r / 255,
		G = g / 255,
		B = b / 255;
	const max = Math.max(R, G, B),
		min = Math.min(R, G, B);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === R) h = ((G - B) / d) % 6;
		else if (max === G) h = (B - R) / d + 2;
		else h = (R - G) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
	const H = ((h % 360) + 360) % 360;
	const c = v * s;
	const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
	const m = v - c;
	let r: number, g: number, b: number;
	if (H < 60) [r, g, b] = [c, x, 0];
	else if (H < 120) [r, g, b] = [x, c, 0];
	else if (H < 180) [r, g, b] = [0, c, x];
	else if (H < 240) [r, g, b] = [0, x, c];
	else if (H < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/* ── oklch ───────────────────────────────────────────────────────────── */

function oklabToSrgbLinear(L: number, a: number, b: number): [number, number, number] {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3,
		m = m_ ** 3,
		s = s_ ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

function srgbLinearToOklab(r: number, g: number, b: number): [number, number, number] {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

/** oklch → hex. Out-of-gamut channels clamp (the browser does the same). */
export function oklchToHex({ l, c, h }: Oklch, a = 1): string {
	const rad = (h * Math.PI) / 180;
	const [lr, lg, lb] = oklabToSrgbLinear(l, c * Math.cos(rad), c * Math.sin(rad));
	const { r, g, b } = {
		r: linearToSrgb(Math.min(1, Math.max(0, lr))) * 255,
		g: linearToSrgb(Math.min(1, Math.max(0, lg))) * 255,
		b: linearToSrgb(Math.min(1, Math.max(0, lb))) * 255
	};
	return rgbToHex({ r, g, b }, a);
}

/** hex → oklch (no alpha — the hex alpha channel is dropped). */
export function hexToOklch(hex: string): Oklch | null {
	const p = parseHex(hex);
	if (!p) return null;
	const [L, a, b] = srgbLinearToOklab(
		srgbToLinear(p.r / 255),
		srgbToLinear(p.g / 255),
		srgbToLinear(p.b / 255)
	);
	return { l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/* ── the value-shape parser (what a token value might be) ────────────── */

/** A token value → its rgb (alpha included), or null when the picker
 *  cannot render it (the raw string stays untouched in the text field). */
export function parseColor(value: string): (Rgb & { a: number }) | null {
	const v = value.trim();
	const hex = parseHex(v);
	if (hex) return hex;
	const rgb = /^rgba?\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
		v
	);
	if (rgb) {
		const ch = (s: string) =>
			s.endsWith('%') ? (Number.parseFloat(s) / 100) * 255 : Number.parseFloat(s);
		const al = rgb[4] ?? '1';
		const a = al.endsWith('%') ? Number.parseFloat(al) / 100 : Number.parseFloat(al);
		return { r: ch(rgb[1]), g: ch(rgb[2]), b: ch(rgb[3]), a: clamp01(a) };
	}
	const ok =
		/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+(?:deg)?)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(v);
	if (ok) {
		const lRaw = ok[1],
			cRaw = ok[2],
			aRaw = ok[4] ?? '1';
		const l = lRaw.endsWith('%') ? Number.parseFloat(lRaw) / 100 : Number.parseFloat(lRaw);
		const c = cRaw.endsWith('%') ? Number.parseFloat(cRaw) / 100 : Number.parseFloat(cRaw);
		const a = aRaw.endsWith('%') ? Number.parseFloat(aRaw) / 100 : Number.parseFloat(aRaw);
		const h = Number.parseFloat(ok[3].replace('deg', ''));
		const p = parseHex(oklchToHex({ l, c, h }, 1));
		return p ? { ...p, a: clamp01(a) } : null;
	}
	return null;
}

/* ── the picker's mosaic (Grid tab) ──────────────────────────────────── */

/** The Grid tab's mosaic: ONE grayscale strip + 12 hue columns ×
 *  brightness steps (the Figma reference). Computed once, module scope. */
export function gridMosaic(): Hsv[][] {
	const rows: Hsv[][] = [];
	rows.push(Array.from({ length: 10 }, (_, g) => ({ h: 0, s: 0, v: g / 9 }) as Hsv));
	const hues = 12,
		steps = 8;
	for (let hi = 0; hi < hues; hi++) {
		const column: Hsv[] = [];
		for (let i = 0; i < steps; i++) {
			column.push({
				h: (hi * 360) / hues,
				s: 1 - (i / steps) * 0.55,
				v: 1 - (i / steps) * 0.75
			});
		}
		rows.push(column);
	}
	return rows;
}
