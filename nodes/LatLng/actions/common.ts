import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_MS } from '../shared/hosts';

export type Handler = (ctx: IExecuteFunctions, itemIndex: number) => Promise<INodeExecutionData[]>;

export interface CommonOptions {
	language?: string;
	timeout: number;
}

export function getOptions(ctx: IExecuteFunctions, itemIndex: number): CommonOptions {
	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	return {
		language: (options.language as string | undefined)?.trim() || undefined,
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
