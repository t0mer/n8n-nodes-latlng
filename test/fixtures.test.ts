import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { extractors } from '../nodes/LatLng/shared/mappers';
import forward from './fixtures/live/geocode-forward.json';
import reverse from './fixtures/live/geocode-reverse.json';
import autosuggest from './fixtures/live/place-autosuggest.json';
import categories from './fixtures/live/place-categories.json';
import nearby from './fixtures/live/place-nearby.json';
import search from './fixtures/live/place-search.json';
import tilejson from './fixtures/live/tiles-metadata.json';

const body = (fixture: { body: unknown }) => fixture.body as IDataObject;

// Mappers against sanitized real responses captured by `npm run smoke`.
describe('live fixtures', () => {
	it.each([
		['forward', forward],
		['reverse', reverse],
	])('%s geocoding flattens to name + numeric lat/lon near Dizengoff Square', (_name, fixture) => {
		const [first] = extractors.features(body(fixture));
		expect(typeof first.name).toBe('string');
		expect(first.lat).toBeCloseTo(32.078, 2);
		expect(first.lon).toBeCloseTo(34.774, 2);
		expect(first).toHaveProperty('city');
	});

	it('places search and nearby give one flat item per place', () => {
		for (const fixture of [search, nearby]) {
			const places = extractors.places(body(fixture));
			expect(places).toHaveLength((body(fixture).places as unknown[]).length);
			expect(places[0]).toMatchObject({ name: expect.any(String), lat: expect.any(Number) });
		}
		expect(extractors.places(body(nearby))[0].distance_m).toBeLessThan(500);
	});

	it('autosuggest reads the suggestions list', () => {
		const [first] = extractors.suggestions(body(autosuggest));
		expect(first).toMatchObject({
			name: expect.any(String),
			lat: expect.any(Number),
			lon: expect.any(Number),
		});
	});

	it('categories become one item per category', () => {
		const list = extractors.categories(body(categories));
		expect(list.length).toBe(body(categories).count);
		expect(list[0]).toHaveProperty('category');
	});

	it('committed fixtures contain no key values', () => {
		const text = JSON.stringify([
			forward,
			reverse,
			autosuggest,
			categories,
			nearby,
			search,
			tilejson,
		]);
		expect(text).not.toMatch(/(?:pk_)?latlng_[A-Za-z0-9]{16,}/);
		expect(text).not.toMatch(/[?&](?:key|api_key)=(?!REDACTED)/);
	});
});
