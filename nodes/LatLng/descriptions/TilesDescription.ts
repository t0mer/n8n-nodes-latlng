import type { INodeProperties } from 'n8n-workflow';

type TileResource = 'tile' | 'dataset';

const show = (resource: TileResource, ...operation: string[]) => ({
	resource: [resource],
	...(operation.length ? { operation } : {}),
});

function operations(resource: TileResource, what: string): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: show(resource) },
		options: [
			{
				name: 'Get Metadata',
				value: 'getMetadata',
				description: `Get the TileJSON for ${what}: bounds, min/max zoom, layers and attribution`,
				action: `Get ${resource === 'tile' ? 'tile' : 'dataset'} metadata`,
			},
			{
				name: 'Get Vector Tile',
				value: 'getTile',
				description: `Download one Mapbox Vector Tile (protobuf, .pbf) of ${what} as binary data`,
				action: `Get a ${resource === 'tile' ? '' : 'dataset '}vector tile`,
			},
		],
		default: 'getMetadata',
	};
}

function tileFields(resource: TileResource, maxZoom: number): INodeProperties[] {
	const onTile = { show: show(resource, 'getTile') };
	return [
		{
			displayName: 'Zoom (Z)',
			name: 'z',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: 0, maxValue: maxZoom },
			description: `Tile zoom level (0–${maxZoom})`,
			displayOptions: onTile,
		},
		{
			displayName: 'Column (X)',
			name: 'x',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: 0 },
			description: 'Tile column, from 0 to 2^z - 1',
			displayOptions: onTile,
		},
		{
			displayName: 'Row (Y)',
			name: 'y',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: 0 },
			description: 'Tile row (XYZ scheme, 0 at the top), from 0 to 2^z - 1',
			displayOptions: onTile,
		},
		{
			displayName: 'Put Output File in Field',
			name: 'binaryPropertyName',
			type: 'string',
			required: true,
			default: 'data',
			hint: 'The name of the output binary field to put the file in',
			displayOptions: onTile,
		},
	];
}

/** The base map TileJSON reports maxzoom 15. */
export const TILE_MAX_ZOOM = 15;
export const DATASET_MAX_ZOOM = 14;

export const tilesOperations = [operations('tile', 'the LatLng base map')];
export const tilesFields = tileFields('tile', TILE_MAX_ZOOM);

export const datasetOperations = [operations('dataset', 'one of your uploaded datasets')];
export const datasetFields: INodeProperties[] = [
	{
		displayName: 'Dataset ID',
		name: 'datasetId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. ds_abc123xyz',
		description: 'ID of a dataset owned by the Maps key account',
		displayOptions: { show: show('dataset') },
	},
	...tileFields('dataset', DATASET_MAX_ZOOM),
];
