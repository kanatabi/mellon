/**
 * The upload-time EXIF capture (Round B, owner sketch 2026-11-22).
 *
 * lumen NEVER parses image metadata — the strip promise is test-pinned
 * (§5: decode-and-REBUILD). The capture happens HERE, in the browser,
 * BEFORE the upload: exifr reads the curated fields off the File, mellon
 * ships them as the multipart 'exif' field, and lumen stores ONLY its
 * allowlisted subset (the GPS family is not a key — denied by
 * construction on the wire side too: these options never request it).
 *
 * The result mirrors `PhotoExif` in #lib/api/types.ts; a photo without
 * EXIF (PNG, stripped, pre-capture era) captures as null — the panel's
 * honest empty state.
 */
import exifr from 'exifr';

export interface PhotoExif {
	takenAt?: string;
	camera?: string;
	lens?: string;
	shutter?: string;
	iso?: number;
	aperture?: number;
}

/** The exifr option keys — the CURATED set, and nothing else. */
const EXIF_KEYS = [
	'DateTimeOriginal',
	'Make',
	'Model',
	'LensModel',
	'ExposureTime',
	'ISO',
	'FNumber'
];

/** Shutter: the exposure-time float → the photographer's fraction. */
function shutterText(seconds: number): string {
	if (seconds > 0 && seconds < 1) return `1/${Math.round(1 / seconds)}`;
	return `${Number(seconds.toFixed(1))}s`;
}

export async function captureExif(file: File): Promise<PhotoExif | null> {
	try {
		const raw = (await exifr.parse(file, EXIF_KEYS)) as Record<string, unknown> | undefined;
		if (!raw) return null;
		const out: PhotoExif = {};
		if (raw.DateTimeOriginal instanceof Date && !Number.isNaN(raw.DateTimeOriginal.valueOf()))
			out.takenAt = raw.DateTimeOriginal.toISOString();
		const make = typeof raw.Make === 'string' ? raw.Make.trim() : '';
		const model = typeof raw.Model === 'string' ? raw.Model.trim() : '';
		if (make || model) out.camera = [make, model].filter(Boolean).join(' ');
		if (typeof raw.LensModel === 'string' && raw.LensModel.trim()) out.lens = raw.LensModel.trim();
		if (typeof raw.ExposureTime === 'number' && raw.ExposureTime > 0)
			out.shutter = shutterText(raw.ExposureTime);
		if (typeof raw.ISO === 'number' && raw.ISO > 0) out.iso = raw.ISO;
		if (typeof raw.FNumber === 'number' && raw.FNumber > 0) out.aperture = raw.FNumber;
		return Object.keys(out).length ? out : null;
	} catch {
		// No EXIF, a PNG, a corrupt tail — the capture is ADVICE, never a
		// gate: the upload proceeds, the panel shows the empty state.
		return null;
	}
}
