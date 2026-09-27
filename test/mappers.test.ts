import { describe, expect, it } from 'vitest';
import { extractors, flattenFeature } from '../nodes/LatLng/shared/mappers';

describe('flattenFeature', () => {
	it('puts name first, converts [lon, lat] and keeps properties', () => {
		const out = flattenFeature({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [34.78, 32.08] },
			properties: { name: 'X', street: 'Dizengoff', countrycode: 'IL' },
		});
		expect(out).toEqual({
			name: 'X',
			lat: 32.08,
			lon: 34.78,
			street: 'Dizengoff',
			countrycode: 'IL',
		});
		expect(Object.keys(out).slice(0, 3)).toEqual(['name', 'lat', 'lon']);
	});

	it('keeps non-point geometry as is', () => {
		const geometry = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[1, 1],
			],
		};
		expect(flattenFeature({ geometry, properties: { type: 'street' } })).toEqual({
			type: 'street',
			geometry,
		});
	});
});

describe('geometry wins', () => {
	it('does not let properties override the geometry coordinates', () => {
		const out = flattenFeature({
			geometry: { type: 'Point', coordinates: [34.774, 32.0779] },
			properties: { name: 'X', lat: '1', lon: '2' },
		});
		expect(out).toMatchObject({ lat: 32.0779, lon: 34.774 });
	});
});

describe('extractors', () => {
	it('accept a single Feature (reverse geocoding)', () => {
		expect(
			extractors.features({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [34.774, 32.0779] },
				properties: { name: 'Dizengoff Square', city: 'Tel Aviv' },
			}),
		).toEqual([{ name: 'Dizengoff Square', lat: 32.0779, lon: 34.774, city: 'Tel Aviv' }]);
	});

	it('tolerate missing lists', () => {
		expect(extractors.features({})).toEqual([]);
		expect(extractors.places({ places: null })).toEqual([]);
		expect(extractors.suggestions({ results: [{ name: 'a' }] })).toEqual([{ name: 'a' }]);
		expect(extractors.categories({ categories: [{ name: 'cafe', count: 1 }] })).toHaveLength(1);
	});
});
