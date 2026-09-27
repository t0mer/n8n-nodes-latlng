import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { toBbox, toLngLat, validateLatLon, type LatLon } from './coords';

export const STATIC_STYLES = ['light', 'dark', 'grayscale', 'black', 'white', 'contrast'] as const;
export const DEFAULT_MARKER_COLOR = 'e11d48';
export const DEFAULT_PATH = { weight: 3, color: '2563eb', opacity: 0.8 };
export const MAX_SIZE = 2048;
/** Above this query length a 400/414 is most likely caused by the URL size. */
export const LONG_QUERY = 4000;

export interface MarkerInput {
	latitude: unknown;
	longitude: unknown;
	color?: string;
	label?: string;
}

export interface PathInput {
	weight?: number;
	color?: string;
	opacity?: number;
	points: Array<{ latitude: unknown; longitude: unknown }>;
}

export interface StaticMapInput {
	framing: 'center' | 'bbox';
	latitude?: unknown;
	longitude?: unknown;
	zoom?: number;
	minLatitude?: unknown;
	minLongitude?: unknown;
	maxLatitude?: unknown;
	maxLongitude?: unknown;
	width: number;
	height: number;
	style: string;
	format: string;
	markers?: MarkerInput[];
	paths?: PathInput[];
	geojson?: unknown;
}

function fail(node: INode, message: string, itemIndex: number): never {
	throw new NodeOperationError(node, `${message} [item ${itemIndex}]`, { itemIndex });
}

/** Hex colour without `#` (a leading `#` is stripped). */
export function normalizeColor(
	node: INode,
	color: string | undefined,
	fallback: string,
	itemIndex: number,
): string {
	const value = (color ?? '').trim().replace(/^#/, '');
	if (!value) return fallback;
	if (!/^[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(value)) {
		fail(node, `Color "${color}" is not a hex colour like e11d48 or #e11d48`, itemIndex);
	}
	return value.toLowerCase();
}

function intInRange(
	node: INode,
	label: string,
	value: unknown,
	min: number,
	max: number,
	i: number,
) {
	const n = Number(value);
	if (!Number.isInteger(n) || n < min || n > max) {
		fail(
			node,
			`${label} must be a whole number from ${min} to ${max} (got ${JSON.stringify(value)})`,
			i,
		);
	}
	return n;
}

/** `lng,lat,color,label` entries joined with `|`. */
export function buildMarkers(node: INode, markers: MarkerInput[], itemIndex: number): string {
	return markers
		.map((m, n) => {
			const point = validateLatLon(node, m.latitude, m.longitude, itemIndex, `Marker ${n + 1} `);
			const color = normalizeColor(node, m.color, DEFAULT_MARKER_COLOR, itemIndex);
			// `,` and `|` are separators in the markers syntax.
			const label = (m.label ?? '').replace(/[,|]/g, ' ').trim();
			return [toLngLat(point), color, label].filter(Boolean).join(',');
		})
		.join('|');
}

/** `weight:color:opacity|lng,lat|lng,lat…`, one string per path. */
export function buildPath(node: INode, path: PathInput, n: number, itemIndex: number): string {
	const label = `Path ${n + 1}`;
	if (!path.points || path.points.length < 2)
		fail(node, `${label} needs at least 2 points`, itemIndex);
	const weight = path.weight ?? DEFAULT_PATH.weight;
	if (!(weight > 0)) fail(node, `${label} weight must be greater than 0`, itemIndex);
	const opacity = path.opacity ?? DEFAULT_PATH.opacity;
	if (!(opacity >= 0 && opacity <= 1))
		fail(node, `${label} opacity must be from 0 to 1`, itemIndex);
	const color = normalizeColor(node, path.color, DEFAULT_PATH.color, itemIndex);
	const points = path.points.map((p, k) =>
		toLngLat(validateLatLon(node, p.latitude, p.longitude, itemIndex, `${label} point ${k + 1} `)),
	);
	return [`${weight}:${color}:${opacity}`, ...points].join('|');
}

/** Validates and serializes a GeoJSON overlay given as text or an object. */
export function serializeGeoJson(
	node: INode,
	value: unknown,
	itemIndex: number,
): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	let parsed = value;
	if (typeof value === 'string') {
		if (!value.trim()) return undefined;
		try {
			parsed = JSON.parse(value);
		} catch {
			fail(node, 'GeoJSON is not valid JSON', itemIndex);
		}
	}
	if (!parsed || typeof parsed !== 'object' || typeof (parsed as IDataObject).type !== 'string') {
		fail(node, 'GeoJSON must be an object with a "type" (e.g. FeatureCollection)', itemIndex);
	}
	return JSON.stringify(parsed);
}

/** Builds the query string for GET /v1/static. The key is never part of it. */
export function buildStaticMapQuery(node: INode, input: StaticMapInput, i: number): IDataObject {
	const qs: IDataObject = {};
	if (input.framing === 'bbox') {
		const min: LatLon = validateLatLon(node, input.minLatitude, input.minLongitude, i, 'Min ');
		const max: LatLon = validateLatLon(node, input.maxLatitude, input.maxLongitude, i, 'Max ');
		qs.bbox = toBbox(node, min, max, i);
	} else {
		qs.center = toLngLat(validateLatLon(node, input.latitude, input.longitude, i));
		qs.zoom = intInRange(node, 'Zoom', input.zoom, 0, 20, i);
	}
	qs.width = intInRange(node, 'Width', input.width, 1, MAX_SIZE, i);
	qs.height = intInRange(node, 'Height', input.height, 1, MAX_SIZE, i);
	if (!(STATIC_STYLES as readonly string[]).includes(input.style)) {
		fail(node, `Style must be one of ${STATIC_STYLES.join(', ')}`, i);
	}
	qs.style = input.style;
	if (input.format !== 'png' && input.format !== 'jpeg')
		fail(node, 'Format must be png or jpeg', i);
	qs.format = input.format;
	if (input.markers?.length) qs.markers = buildMarkers(node, input.markers, i);
	if (input.paths?.length) qs.path = input.paths.map((p, n) => buildPath(node, p, n, i));
	const geojson = serializeGeoJson(node, input.geojson, i);
	if (geojson) qs.geojson = geojson;
	return qs;
}

/** Approximate encoded length of the query string, to explain 400/414 on very long URLs. */
export function queryLength(qs: IDataObject): number {
	let length = 0;
	for (const [key, value] of Object.entries(qs)) {
		for (const v of Array.isArray(value) ? value : [value]) {
			length += key.length + 2 + encodeURIComponent(String(v)).length;
		}
	}
	return length;
}
