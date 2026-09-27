import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { toBbox, validateLatLon } from '../shared/coords';
import { extractors } from '../shared/mappers';
import { cleanQs, latlngRequest } from '../shared/transport';
import { getOptions, requiredString, shapeList, type Handler } from './common';

function getFilters(ctx: IExecuteFunctions, i: number): IDataObject {
	return ctx.getNodeParameter('filters', i, {}) as IDataObject;
}

/** Optional "near" point from filters: both coordinates or neither. */
export function biasPoint(ctx: IExecuteFunctions, filters: IDataObject, i: number): IDataObject {
	const hasLat = filters.latitude !== undefined && filters.latitude !== '';
	const hasLon = filters.longitude !== undefined && filters.longitude !== '';
	if (!hasLat && !hasLon) return {};
	if (hasLat !== hasLon) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Set both Near Latitude and Near Longitude, or neither [item ${i}]`,
			{ itemIndex: i },
		);
	}
	const { lat, lon } = validateLatLon(ctx.getNode(), filters.latitude, filters.longitude, i);
	return { lat, lon };
}

export const search: Handler = async (ctx, i) => {
	const q = requiredString(ctx, 'query', 'Search Query', i);
	const filters = getFilters(ctx, i);
	const { timeout } = getOptions(ctx, i);
	const qs = {
		q,
		...biasPoint(ctx, filters, i),
		category: filters.category,
		country: filters.country,
		limit: ctx.getNodeParameter('maxResults', i, 10),
	};
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'api', path: '/v1/places/search', qs, timeout },
		i,
	);
	return shapeList(ctx, i, res, extractors.places, cleanQs(qs));
};

export const nearby: Handler = async (ctx, i) => {
	const point = validateLatLon(
		ctx.getNode(),
		ctx.getNodeParameter('latitude', i),
		ctx.getNodeParameter('longitude', i),
		i,
	);
	const filters = getFilters(ctx, i);
	const { timeout } = getOptions(ctx, i);
	const qs = {
		...point,
		radius: ctx.getNodeParameter('radius', i, 1000),
		category: filters.category,
		limit: ctx.getNodeParameter('maxResults', i, 20),
	};
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'api', path: '/v1/places/nearby', qs, timeout },
		i,
	);
	return shapeList(ctx, i, res, extractors.places, cleanQs(qs));
};

export const autosuggest: Handler = async (ctx, i) => {
	const q = requiredString(ctx, 'query', 'Partial Query', i, 2);
	const filters = getFilters(ctx, i);
	const near = biasPoint(ctx, filters, i);
	if (filters.radius !== undefined && near.lat === undefined) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Radius needs Near Latitude and Near Longitude [item ${i}]`,
			{ itemIndex: i },
		);
	}
	const box = (filters.boundingBox as IDataObject | undefined)?.box as IDataObject | undefined;
	let bbox: string | undefined;
	if (box) {
		const node = ctx.getNode();
		const min = validateLatLon(node, box.minLat, box.minLon, i, 'Min ');
		const max = validateLatLon(node, box.maxLat, box.maxLon, i, 'Max ');
		bbox = toBbox(node, min, max, i);
	}
	const { timeout } = getOptions(ctx, i);
	const qs = {
		q,
		...near,
		radius: filters.radius,
		country: filters.country,
		bbox,
		limit: Math.min(ctx.getNodeParameter('maxResults', i, 5) as number, 20),
	};
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'suggest', path: '/autosuggest', qs, timeout },
		i,
	);
	return shapeList(ctx, i, res, extractors.suggestions, cleanQs(qs));
};

export const getCategories: Handler = async (ctx, i) => {
	const { timeout } = getOptions(ctx, i);
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'api', path: '/v1/places/categories', timeout },
		i,
	);
	return shapeList(ctx, i, res, extractors.categories, {});
};
