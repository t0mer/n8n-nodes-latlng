import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_MS } from '../shared/hosts';
import type { Extractor } from '../shared/mappers';
import type { LatLngResponse } from '../shared/transport';

export type Handler = (ctx: IExecuteFunctions, itemIndex: number) => Promise<INodeExecutionData[]>;

export interface CommonOptions {
	includeRateLimit: boolean;
	language?: string;
	returnEmptyItem: boolean;
	timeout: number;
}

export function getOptions(ctx: IExecuteFunctions, itemIndex: number): CommonOptions {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	return {
		includeRateLimit: options.includeRateLimit === true,
		language: (options.language as string | undefined)?.trim() || undefined,
		returnEmptyItem: options.returnEmptyItem === true,
		timeout: (options.timeout as number | undefined) || DEFAULT_TIMEOUT_MS,
	};
}

/** Reads a required, non-blank string parameter. */
export function requiredString(
	ctx: IExecuteFunctions,
	name: string,
	label: string,
	itemIndex: number,
	minLength = 1,
): string {
	const value = String(ctx.getNodeParameter(name, itemIndex, '') ?? '').trim();
	if (value.length < minLength) {
		const need = minLength > 1 ? `at least ${minLength} characters` : 'a value';
		throw new NodeOperationError(ctx.getNode(), `${label} needs ${need} [item ${itemIndex}]`, {
			itemIndex,
		});
	}
	return value;
}

/**
 * Simplify on: one item per result, or nothing (or a `found: false` item) when empty.
 * Simplify off: the raw response as a single item.
 */
export function shapeList(
	ctx: IExecuteFunctions,
	itemIndex: number,
	res: LatLngResponse<IDataObject>,
	extract: Extractor,
	query: IDataObject,
): INodeExecutionData[] {
	const simplify = ctx.getNodeParameter('simplify', itemIndex, true) as boolean;
	const options = getOptions(ctx, itemIndex);
	let items: INodeExecutionData[];
	if (!simplify) {
		items = [{ json: res.body }];
	} else {
		items = extract(res.body ?? {}).map((json) => ({ json }));
		if (!items.length && options.returnEmptyItem) items = [{ json: { found: false, query } }];
	}
	return options.includeRateLimit ? withRateLimit(items, res.headers) : items;
}

/** Reads X-RateLimit-Limit / X-RateLimit-Remaining (header names are case-insensitive). */
export function rateLimitFrom(headers: IDataObject): IDataObject {
	const read = (name: string) => {
		const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
		const value = key === undefined ? undefined : Number(headers[key]);
		return value === undefined || Number.isNaN(value) ? null : value;
	};
	return { limit: read('x-ratelimit-limit'), remaining: read('x-ratelimit-remaining') };
}

export function withRateLimit(
	items: INodeExecutionData[],
	headers: IDataObject,
): INodeExecutionData[] {
	const rateLimit = rateLimitFrom(headers);
	return items.map((item) => ({ ...item, json: { ...item.json, rateLimit } }));
}
