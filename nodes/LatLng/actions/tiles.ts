import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { DATASET_MAX_ZOOM, TILE_MAX_ZOOM } from '../descriptions/TilesDescription';
import { CREDENTIAL_TYPE } from '../shared/hosts';
import { redactDeep } from '../shared/redact';
import { latlngRequest } from '../shared/transport';
import { getOptions, requiredString, withRateLimit, type Handler } from './common';

async function getMapsKey(ctx: IExecuteFunctions, i: number): Promise<string> {
	const credentials = await ctx.getCredentials(CREDENTIAL_TYPE, i);
	const mapsKey = String(credentials.mapsKey ?? '').trim();
	if (!mapsKey) {
		throw new NodeOperationError(
			ctx.getNode(),
			'The Tiles and Dataset resources need a Maps key (pk_latlng_…). Add it to the LatLng API credential.',
			{ itemIndex: i },
		);
	}
	return mapsKey;
}

/** Validates z/x/y as non-negative integers with x, y < 2^z. */
export function tileCoords(ctx: IExecuteFunctions, i: number, maxZoom: number) {
	const read = (name: string) => Number(ctx.getNodeParameter(name, i));
	const [z, x, y] = [read('z'), read('x'), read('y')];
	const fail = (message: string) => {
		throw new NodeOperationError(ctx.getNode(), `${message} [item ${i}]`, { itemIndex: i });
	};
	if (!Number.isInteger(z) || z < 0 || z > maxZoom)
		fail(`Zoom must be a whole number from 0 to ${maxZoom}`);
	const size = 2 ** z;
	for (const [label, v] of [
		['Column (X)', x],
		['Row (Y)', y],
	] as const) {
		if (!Number.isInteger(v) || v < 0 || v >= size) {
			fail(`${label} must be a whole number from 0 to ${size - 1} at zoom ${z} (got ${v})`);
		}
	}
	return { z, x, y };
}

function datasetPath(ctx: IExecuteFunctions, i: number): string {
	const id = requiredString(ctx, 'datasetId', 'Dataset ID', i);
	if (!/^[A-Za-z0-9_-]+$/.test(id)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Dataset ID may only contain letters, digits, _ and - [item ${i}]`,
			{ itemIndex: i },
		);
	}
	return `/v1/datasets/${id}`;
}

function metadata(prefix: (ctx: IExecuteFunctions, i: number) => string): Handler {
	return async (ctx, i) => {
		const path = `${prefix(ctx, i)}/metadata`;
		const mapsKey = await getMapsKey(ctx, i);
		const options = getOptions(ctx, i);
		const res = await latlngRequest<IDataObject>(
			ctx,
			{ host: 'tiles', path, mapsKey, timeout: options.timeout },
			i,
		);
		// TileJSON echoes the key inside its tile URLs.
		const items = [{ json: redactDeep(res.body) }];
		return options.includeRateLimit ? withRateLimit(items, res.headers) : items;
	};
}

function vectorTile(
	prefix: (ctx: IExecuteFunctions, i: number) => string,
	maxZoom: number,
): Handler {
	return async (ctx, i) => {
		const base = prefix(ctx, i);
		const { z, x, y } = tileCoords(ctx, i, maxZoom);
		const binaryPropertyName = requiredString(
			ctx,
			'binaryPropertyName',
			'Put Output File in Field',
			i,
		);
		const mapsKey = await getMapsKey(ctx, i);
		const options = getOptions(ctx, i);
		const res = await latlngRequest<Buffer>(
			ctx,
			{
				host: 'tiles',
				path: `${base}/${z}/${x}/${y}.pbf`,
				mapsKey,
				binary: true,
				timeout: options.timeout,
			},
			i,
		);
		const mimeType = 'application/x-protobuf';
		const fileName = `${z}-${x}-${y}.pbf`;
		const binary = await ctx.helpers.prepareBinaryData(res.body, fileName, mimeType);
		const items = [
			{
				json: { z, x, y, fileName, mimeType, fileSize: res.body.length },
				binary: { [binaryPropertyName]: binary },
			},
		];
		return options.includeRateLimit ? withRateLimit(items, res.headers) : items;
	};
}

export const tilesGetMetadata = metadata(() => '/v1');
export const tilesGetTile = vectorTile(() => '/v1/tiles', TILE_MAX_ZOOM);
export const datasetGetMetadata = metadata(datasetPath);
export const datasetGetTile = vectorTile(datasetPath, DATASET_MAX_ZOOM);
