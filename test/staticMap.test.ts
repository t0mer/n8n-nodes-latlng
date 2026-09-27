import { NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	buildMarkers,
	buildPath,
	buildStaticMapQuery,
	normalizeColor,
	queryLength,
	serializeGeoJson,
	type StaticMapInput,
} from '../nodes/LatLng/shared/staticMap';
import { NODE } from './helpers';

const base: StaticMapInput = {
	framing: 'center',
	latitude: 32.08,
	longitude: 34.78,
	zoom: 15,
	width: 800,
	height: 600,
	style: 'dark',
	format: 'png',
};

describe('buildStaticMapQuery', () => {
	it('builds center as lng,lat', () => {
		expect(buildStaticMapQuery(NODE, base, 0)).toEqual({
			center: '34.78,32.08',
			zoom: 15,
			width: 800,
			height: 600,
			style: 'dark',
			format: 'png',
		});
	});

	it('builds bbox as minLng,minLat,maxLng,maxLat and omits center/zoom', () => {
		const qs = buildStaticMapQuery(
			NODE,
			{
				...base,
				framing: 'bbox',
				minLatitude: 32.0,
				minLongitude: 34.7,
				maxLatitude: 32.1,
				maxLongitude: 34.9,
			},
			0,
		);
		expect(qs.bbox).toBe('34.7,32,34.9,32.1');
		expect(qs).not.toHaveProperty('center');
		expect(qs).not.toHaveProperty('zoom');
	});

	it.each([
		[{ zoom: 21 }, /Zoom/],
		[{ width: 4096 }, /Width/],
		[{ height: 0 }, /Height/],
		[{ style: 'neon' }, /Style/],
		[{ format: 'gif' }, /Format/],
		[{ latitude: 95 }, /Latitude/],
	])('rejects %o', (patch, pattern) => {
		expect(() => buildStaticMapQuery(NODE, { ...base, ...patch } as StaticMapInput, 1)).toThrow(
			pattern,
		);
	});

	it('adds markers, repeated paths and serialized GeoJSON', () => {
		const qs = buildStaticMapQuery(
			NODE,
			{
				...base,
				markers: [{ latitude: 32.08, longitude: 34.78, color: '#22C55E', label: 'A' }],
				paths: [
					{
						points: [
							{ latitude: 32.08, longitude: 34.78 },
							{ latitude: 32.09, longitude: 34.79 },
						],
					},
					{
						weight: 5,
						color: 'ff0000',
						opacity: 0.5,
						points: [
							{ latitude: 1, longitude: 2 },
							{ latitude: 3, longitude: 4 },
						],
					},
				],
				geojson: '{ "type": "Point", "coordinates": [34.78, 32.08] }',
			},
			0,
		);
		expect(qs.markers).toBe('34.78,32.08,#22c55e,A');
		expect(qs.path).toEqual(['3:2563eb:0.8|34.78,32.08|34.79,32.09', '5:ff0000:0.5|2,1|4,3']);
		expect(qs.geojson).toBe('{"type":"Point","coordinates":[34.78,32.08]}');
	});
});

describe('markers', () => {
	it('joins with | and uses the default colour; strips separators from labels', () => {
		expect(
			buildMarkers(
				NODE,
				[
					{ latitude: 32.08, longitude: 34.78 },
					{ latitude: 32.09, longitude: 34.79, label: 'Cafe, Bar|X' },
				],
				0,
			),
		).toBe('34.78,32.08,#e11d48|34.79,32.09,#e11d48,Cafe  Bar X');
	});

	it('names the bad marker', () => {
		expect(() =>
			buildMarkers(
				NODE,
				[
					{ latitude: 0, longitude: 0 },
					{ latitude: 0, longitude: 200 },
				],
				3,
			),
		).toThrow(/Marker 2 Longitude .* \[item 3\]/);
	});
});

describe('paths', () => {
	it('needs 2 points and a valid opacity', () => {
		expect(() => buildPath(NODE, { points: [{ latitude: 0, longitude: 0 }] }, 0, 0)).toThrow(
			/Path 1 needs at least 2 points/,
		);
		const points = [
			{ latitude: 0, longitude: 0 },
			{ latitude: 1, longitude: 1 },
		];
		expect(() => buildPath(NODE, { opacity: 2, points }, 0, 0)).toThrow(/opacity/);
	});
});

describe('colours and GeoJSON', () => {
	it('normalizes colours', () => {
		expect(normalizeColor(NODE, '#ABC', 'x', 0)).toBe('abc');
		expect(normalizeColor(NODE, '', 'e11d48', 0)).toBe('e11d48');
		expect(() => normalizeColor(NODE, 'red', 'x', 0)).toThrow(NodeOperationError);
	});

	it('validates GeoJSON', () => {
		expect(serializeGeoJson(NODE, '', 0)).toBeUndefined();
		expect(serializeGeoJson(NODE, { type: 'FeatureCollection', features: [] }, 0)).toBe(
			'{"type":"FeatureCollection","features":[]}',
		);
		expect(() => serializeGeoJson(NODE, '{oops', 0)).toThrow(/not valid JSON/);
		expect(() => serializeGeoJson(NODE, '[1,2]', 0)).toThrow(/"type"/);
	});

	it('measures encoded query length including repeated params', () => {
		expect(queryLength({ a: 'b c', path: ['x', 'y'] })).toBe(
			'a=b%20c&'.length + 'path=x&'.length * 2,
		);
	});
});
