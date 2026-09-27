import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_MS } from '../shared/hosts';
import type { Extractor } from '../shared/mappers';
import type { LatLngResponse } from '../shared/transport';

export type Handler = (ctx: IExecuteFunctions, itemIndex: number) => Promise<INodeExecutionData[]>;

export interface CommonOptions {
	language?: string;
	returnEmptyItem: boolean;
	timeout: number;
}

export function getOptions(ctx: IExecuteFunctions, itemIndex: number): CommonOptions {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	return {
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
	if (!simplify) return [{ json: res.body }];
	const results = extract(res.body ?? {});
	if (results.length) return results.map((json) => ({ json }));
	return getOptions(ctx, itemIndex).returnEmptyItem ? [{ json: { found: false, query } }] : [];
}
