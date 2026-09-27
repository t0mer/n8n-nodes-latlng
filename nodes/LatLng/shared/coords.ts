import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * The API mixes coordinate orders: query params take `lat`/`lon`, GeoJSON uses `[lon, lat]`
 * and static maps use `lng,lat`. All ordering happens here.
 */
export interface LatLon {
	lat: number;
	lon: number;
}

function assertInRange(
	node: INode,
	label: string,
	value: unknown,
	limit: number,
	itemIndex: number,
): number {
	const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < -limit || n > limit) {
		throw new NodeOperationError(
			node,
			`${label} must be a number between -${limit} and ${limit} (got ${JSON.stringify(value)}) [item ${itemIndex}]`,
			{ itemIndex },
		);
	}
	return n;
}

/** Validates lat ∈ [-90, 90] and lon ∈ [-180, 180]; `label` prefixes the field names. */
export function validateLatLon(
	node: INode,
	lat: unknown,
	lon: unknown,
	itemIndex: number,
	label = '',
): LatLon {
	return {
		lat: assertInRange(node, `${label}Latitude`, lat, 90, itemIndex),
		lon: assertInRange(node, `${label}Longitude`, lon, 180, itemIndex),
	};
}

/** `lng,lat` string used by the static map `center`, `markers` and `path` params. */
export function toLngLat({ lat, lon }: LatLon): string {
	return `${lon},${lat}`;
}

/** `minLng,minLat,maxLng,maxLat`, used by static map and autosuggest `bbox`. */
export function toBbox(node: INode, min: LatLon, max: LatLon, itemIndex: number): string {
	if (min.lat > max.lat || min.lon > max.lon) {
		throw new NodeOperationError(
			node,
			`Bounding box minimum must be south-west of the maximum (min lat ≤ max lat, min lon ≤ max lon) [item ${itemIndex}]`,
			{ itemIndex },
		);
	}
	return `${min.lon},${min.lat},${max.lon},${max.lat}`;
}

/** Converts a GeoJSON `[lon, lat]` position to `{ lat, lon }`. */
export function fromGeoJson(position: unknown): Partial<LatLon> {
	if (!Array.isArray(position) || position.length < 2) return {};
	const [lon, lat] = position as number[];
	return { lat, lon };
}
