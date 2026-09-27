import type { IDataObject } from 'n8n-workflow';
import { fromGeoJson } from './coords';

const asArray = (value: unknown): IDataObject[] =>
	Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as IDataObject[]) : [];

/** Flattens a GeoJSON feature: `properties` at top level, `[lon, lat]` as `lat`/`lon`. */
export function flattenFeature(feature: IDataObject): IDataObject {
	const properties = (feature.properties ?? {}) as IDataObject;
	const geometry = feature.geometry as IDataObject | undefined;
	const out: IDataObject = { name: properties.name };
	if (geometry?.type === 'Point') Object.assign(out, fromGeoJson(geometry.coordinates));
	Object.assign(out, properties);
	if (geometry && geometry.type !== 'Point') out.geometry = geometry;
	if (feature.bbox) out.bbox = feature.bbox;
	if (out.name === undefined) delete out.name;
	return out;
}

/** Extracts the result list of a response, one flat object per result. */
export const extractors = {
	features: (body: IDataObject) => asArray(body.features).map(flattenFeature),
	places: (body: IDataObject) => asArray(body.places),
	suggestions: (body: IDataObject) => asArray(body.results),
	categories: (body: IDataObject) => asArray(body.categories),
};

export type Extractor = (body: IDataObject) => IDataObject[];
