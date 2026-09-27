import type { INodeProperties } from 'n8n-workflow';

const show = (extra: Record<string, unknown[]> = {}) => ({
	resource: ['staticMap'],
	operation: ['getImage'],
	...extra,
});

const lat = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'number',
	default: 0,
	typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
	description,
});

const lon = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'number',
	default: 0,
	typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
	description,
});

export const staticMapOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['staticMap'] } },
		options: [
			{
				name: 'Get Image',
				value: 'getImage',
				description:
					'Render a map image (PNG or JPEG, up to 2048×2048 pixels) with optional markers, lines and GeoJSON, returned as binary data',
				action: 'Get a static map image',
			},
		],
		default: 'getImage',
	},
];

export const staticMapFields: INodeProperties[] = [
	{
		displayName: 'Framing',
		name: 'framing',
		type: 'options',
		options: [
			{
				name: 'Bounding Box',
				value: 'bbox',
				description:
					'Fit the map to a south-west / north-east box (boxes crossing the 180° meridian are not supported)',
			},
			{
				name: 'Center and Zoom',
				value: 'center',
				description: 'Center the map on a point at a zoom level',
			},
		],
		default: 'center',
		displayOptions: { show: show() },
	},
	{
		...lat('Latitude', 'latitude', 'Latitude of the map center, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['center'] }) },
	},
	{
		...lon('Longitude', 'longitude', 'Longitude of the map center, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['center'] }) },
	},
	{
		displayName: 'Zoom',
		name: 'zoom',
		type: 'number',
		default: 14,
		typeOptions: { minValue: 0, maxValue: 20 },
		description: 'Zoom level from 0 (whole world) to 20 (building level)',
		displayOptions: { show: show({ framing: ['center'] }) },
	},
	{
		...lat('Min Latitude', 'minLatitude', 'Southern edge of the box, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['bbox'] }) },
	},
	{
		...lon('Min Longitude', 'minLongitude', 'Western edge of the box, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['bbox'] }) },
	},
	{
		...lat('Max Latitude', 'maxLatitude', 'Northern edge of the box, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['bbox'] }) },
	},
	{
		...lon('Max Longitude', 'maxLongitude', 'Eastern edge of the box, in decimal degrees'),
		required: true,
		displayOptions: { show: show({ framing: ['bbox'] }) },
	},
	{
		displayName: 'Width',
		name: 'width',
		type: 'number',
		default: 800,
		typeOptions: { minValue: 1, maxValue: 2048 },
		description: 'Image width in pixels (max 2048)',
		displayOptions: { show: show() },
	},
	{
		displayName: 'Height',
		name: 'height',
		type: 'number',
		default: 600,
		typeOptions: { minValue: 1, maxValue: 2048 },
		description: 'Image height in pixels (max 2048)',
		displayOptions: { show: show() },
	},
	{
		displayName: 'Style',
		name: 'style',
		type: 'options',
		options: [
			{ name: 'Black', value: 'black' },
			{ name: 'Contrast', value: 'contrast' },
			{ name: 'Dark', value: 'dark' },
			{ name: 'Grayscale', value: 'grayscale' },
			{ name: 'Light', value: 'light' },
			{ name: 'White', value: 'white' },
		],
		default: 'dark',
		description: 'Map color theme',
		displayOptions: { show: show() },
	},
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [
			{ name: 'JPEG', value: 'jpeg' },
			{ name: 'PNG', value: 'png' },
		],
		default: 'png',
		description: 'Image file format',
		displayOptions: { show: show() },
	},
	{
		displayName: 'Markers',
		name: 'markers',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Marker',
		default: {},
		description: 'Pins to draw on the map',
		displayOptions: { show: show() },
		options: [
			{
				displayName: 'Marker',
				name: 'marker',
				values: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'color',
						default: '#e11d48',
						description: 'Pin color as a hex value',
					},
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						placeholder: 'e.g. A',
						description: 'Short text shown on the pin',
					},
					lat('Latitude', 'latitude', 'Latitude of the pin, in decimal degrees'),
					lon('Longitude', 'longitude', 'Longitude of the pin, in decimal degrees'),
				],
			},
		],
	},
	{
		displayName: 'Paths',
		name: 'paths',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Path',
		default: {},
		description: 'Lines to draw through a series of points',
		displayOptions: { show: show() },
		options: [
			{
				displayName: 'Path',
				name: 'path',
				values: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'color',
						default: '#2563eb',
						description: 'Line color as a hex value',
					},
					{
						displayName: 'Opacity',
						name: 'opacity',
						type: 'number',
						default: 0.8,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
						description: 'Line opacity from 0 (transparent) to 1 (solid)',
					},
					{
						displayName: 'Points',
						name: 'points',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add Point',
						default: {},
						description: 'Points of the line in order (at least 2)',
						options: [
							{
								displayName: 'Point',
								name: 'point',
								values: [
									lat('Latitude', 'latitude', 'Latitude of the point, in decimal degrees'),
									lon('Longitude', 'longitude', 'Longitude of the point, in decimal degrees'),
								],
							},
						],
					},
					{
						displayName: 'Weight',
						name: 'weight',
						type: 'number',
						default: 3,
						typeOptions: { minValue: 1 },
						description: 'Line width in pixels',
					},
				],
			},
		],
	},
	{
		displayName: 'GeoJSON Overlay',
		name: 'geojson',
		type: 'json',
		default: '',
		description:
			'Optional GeoJSON object (Feature, FeatureCollection or geometry) to draw on the map. Coordinates are [longitude, latitude].',
		displayOptions: { show: show() },
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: { show: show() },
	},
];
