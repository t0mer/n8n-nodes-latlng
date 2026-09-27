import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { validateLatLon } from '../shared/coords';
import { latlngRequest } from '../shared/transport';
import { getOptions, requiredString, type Handler } from './common';

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
	return [{ json: res.body }];
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
	return [{ json: res.body }];
};
