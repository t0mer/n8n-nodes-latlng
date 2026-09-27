import type { IDataObject } from 'n8n-workflow';
import {
	buildStaticMapQuery,
	LONG_QUERY,
	queryLength,
	type MarkerInput,
	type PathInput,
} from '../shared/staticMap';
import { latlngRequest } from '../shared/transport';
import { getOptions, requiredString, withRateLimit, type Handler } from './common';

const LONG_HINT =
	'The map request is very long: use fewer markers or paths, or a simpler GeoJSON overlay.';

export const getImage: Handler = async (ctx, i) => {
	const p = (name: string, fallback?: unknown) => ctx.getNodeParameter(name, i, fallback);
	const paths = (p('paths.path', []) as IDataObject[]).map(
		(path): PathInput => ({
			weight: path.weight as number | undefined,
			color: path.color as string | undefined,
			opacity: path.opacity as number | undefined,
			points: ((path.points as IDataObject | undefined)?.point ?? []) as PathInput['points'],
		}),
	);
	const format = p('format', 'png') as string;
	const framing = p('framing', 'center') as 'center' | 'bbox';
	// Only the fields of the chosen framing exist; n8n throws when reading hidden ones.
	const frame =
		framing === 'bbox'
			? {
					minLatitude: p('minLatitude'),
					minLongitude: p('minLongitude'),
					maxLatitude: p('maxLatitude'),
					maxLongitude: p('maxLongitude'),
				}
			: { latitude: p('latitude'), longitude: p('longitude'), zoom: p('zoom', 14) as number };
	const qs = buildStaticMapQuery(
		ctx.getNode(),
		{
			framing,
			...frame,
			width: p('width', 800) as number,
			height: p('height', 600) as number,
			style: p('style', 'dark') as string,
			format,
			markers: p('markers.marker', []) as MarkerInput[],
			paths,
			geojson: p('geojson', ''),
		},
		i,
	);
	const binaryPropertyName = requiredString(
		ctx,
		'binaryPropertyName',
		'Put Output File in Field',
		i,
	);
	const options = getOptions(ctx, i);

	const res = await latlngRequest<Buffer>(
		ctx,
		{
			host: 'api',
			path: '/v1/static',
			qs,
			binary: true,
			timeout: options.timeout,
			errorHint: (status) =>
				status === 400 && queryLength(qs) > LONG_QUERY ? LONG_HINT : undefined,
		},
		i,
	);

	const header = String(res.headers['content-type'] ?? '')
		.split(';')[0]
		.trim();
	const mimeType = header.startsWith('image/') ? header : `image/${format}`;
	const fileName = `latlng-map.${format === 'jpeg' ? 'jpg' : 'png'}`;
	const binary = await ctx.helpers.prepareBinaryData(res.body, fileName, mimeType);
	const items = [
		{
			json: { ...qs, fileName, mimeType, fileSize: res.body.length },
			binary: { [binaryPropertyName]: binary },
		},
	];
	return options.includeRateLimit ? withRateLimit(items, res.headers) : items;
};
