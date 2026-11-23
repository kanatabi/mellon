/**
 * The upload ceilings — the ONE home for the byte budgets that the browser
 * client, the relay route, and the hooks' global guard all read. They must
 * agree with lumen's own caps: this file is the client side of the same
 * decision, not an independent policy.
 */

/** Must equal lumen `media.MaxBytes` — lumen 413s above this, so asking
 *  first (client pre-check, relay pre-check) is the courtesy that saves
 *  a doomed upload. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** The multipart envelope's overhead (boundaries, part headers, the exif
 *  field): a body may exceed the file it carries by this much before the
 *  relay calls the whole request over the line. */
export const MULTIPART_SLACK = 1 << 20;

/** Every OTHER route's ceiling: a raised photo ceiling must not let a
 *  100 MB body get buffered/parsed anywhere else (hooks.server.ts). */
export const GENERAL_BODY_LIMIT = 16 * 1024 * 1024;

/** Human byte line — 1024-base; one decimal while the value is small
 *  (33636879 → "32.1 MB"), integer from 100 up (100 MiB → "100 MB").
 *  The queue rows render this. */
export function formatBytes(n: number): string {
	const units = ['B', 'KB', 'MB', 'GB'] as const;
	let v = n;
	let u = 0;
	while (v >= 1024 && u < units.length - 1) {
		v /= 1024;
		u++;
	}
	const s = v < 100 && u > 0 ? v.toFixed(1) : String(Math.round(v));
	return `${s} ${units[u]}`;
}
