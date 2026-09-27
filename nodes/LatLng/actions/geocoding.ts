import type { IDataObject } from 'n8n-workflow';
import { validateLatLon } from '../shared/coords';
import { latlngRequest } from '../shared/transport';
import { getOptions, requiredString, type Handler } from './common';

export const forward: Handler = async (ctx, i) => {
	const q = requiredString(ctx, 'query', 'Address or Place', i);
	const limit = ctx.getNodeParameter('maxResults', i, 10) as number;
	const { language, timeout } = getOptions(ctx, i);
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'api', path: '/api', qs: { q, limit, lang: language }, timeout },
		i,
	);
	return [{ json: res.body }];
};

export const reverse: Handler = async (ctx, i) => {
	const { lat, lon } = validateLatLon(
		ctx.getNode(),
		ctx.getNodeParameter('latitude', i),
		ctx.getNodeParameter('longitude', i),
		i,
	);
	const { timeout } = getOptions(ctx, i);
	const res = await latlngRequest<IDataObject>(
		ctx,
		{ host: 'api', path: '/reverse', qs: { lat, lon }, timeout },
		i,
	);
	return [{ json: res.body }];
};
