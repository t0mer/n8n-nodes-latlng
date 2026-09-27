import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { fromGeoJson, toBbox, toLngLat, validateLatLon } from '../nodes/LatLng/shared/coords';
import { NODE } from './helpers';

// Asymmetric values (Tel Aviv) so any lat/lon swap is caught.
const TLV = { lat: 32.08, lon: 34.78 };

describe('coords', () => {
	it('builds lng,lat strings', () => {
		expect(toLngLat(TLV)).toBe('34.78,32.08');
	});

	it('converts GeoJSON [lon, lat] to lat/lon', () => {
		expect(fromGeoJson([34.78, 32.08])).toEqual(TLV);
		expect(fromGeoJson(undefined)).toEqual({});
	});

	it('builds bbox as minLng,minLat,maxLng,maxLat', () => {
		expect(toBbox(NODE, { lat: 32.0, lon: 34.7 }, { lat: 32.1, lon: 34.9 }, 0)).toBe(
			'34.7,32,34.9,32.1',
		);
	});

	it('rejects an inverted bbox', () => {
		expect(() => toBbox(NODE, { lat: 33, lon: 34.7 }, { lat: 32, lon: 34.9 }, 0)).toThrow(
			NodeOperationError,
		);
	});

	it('accepts the full valid range and numeric strings', () => {
		expect(validateLatLon(NODE, -90, 180, 0)).toEqual({ lat: -90, lon: 180 });
		expect(validateLatLon(NODE, '32.08', '34.78', 0)).toEqual(TLV);
	});

	it.each([
		[91, 0, /Latitude/],
		[0, -181, /Longitude/],
		[Number.NaN, 0, /Latitude/],
		['', 0, /Latitude/],
		[undefined, 0, /Latitude/],
	])('rejects lat=%s lon=%s', (lat, lon, pattern) => {
		expect(() => validateLatLon(NODE, lat, lon, 4)).toThrow(pattern);
	});

	it('names the item index and uses the label', () => {
		const error = (() => {
			try {
				validateLatLon(NODE, 100, 0, 2, 'Marker ');
			} catch (e) {
				return e as NodeOperationError;
			}
		})();
		expect(error?.message).toMatch(/^Marker Latitude must be .* \[item 2\]$/);
		expect(error?.context.itemIndex).toBe(2);
	});
});
