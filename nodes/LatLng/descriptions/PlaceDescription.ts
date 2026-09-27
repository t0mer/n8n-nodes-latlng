import type { INodeProperties } from 'n8n-workflow';
import { latLonFields } from './common';

const show = (...operation: string[]) => ({ resource: ['place'], operation });

const categoryField: INodeProperties = {
	displayName: 'Category',
	name: 'category',
	type: 'string',
	default: '',
	placeholder: 'e.g. cafe',
	description: 'Only return places of this category (e.g. cafe, restaurant, hotel, pharmacy)',
};

const biasFields: INodeProperties[] = [
	{
		displayName: 'Near Latitude',
		name: 'latitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		description:
			'Latitude in decimal degrees to rank results by distance from. Use together with Near Longitude.',
	},
	{
		displayName: 'Near Longitude',
		name: 'longitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		description:
			'Longitude in decimal degrees to rank results by distance from. Use together with Near Latitude.',
	},
];

export const placeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['place'] } },
		options: [
			{
				name: 'Autosuggest',
				value: 'autosuggest',
				description:
					'Complete a partial place name as the user types; returns name, category, lat and lon per suggestion',
				action: 'Autosuggest places',
			},
			{
				name: 'Get Categories',
				value: 'getCategories',
				description:
					'List every place category with its number of places, for use in the Category filter',
				action: 'Get place categories',
			},
			{
				name: 'Nearby',
				value: 'nearby',
				description:
					'List places (name, category, lat, lon, distance_m in meters) within a radius of a point',
				action: 'Find places nearby',
			},
			{
				name: 'Search',
				value: 'search',
				description:
					'Search places by name or keyword; returns name, category, lat, lon and match score',
				action: 'Search places',
			},
		],
		default: 'search',
	},
];

export const placeFields: INodeProperties[] = [
	{
		displayName: 'Search Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. coffee',
		description: 'Place name or keyword to search for',
		displayOptions: { show: show('search') },
	},
	{
		displayName: 'Partial Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Dizen',
		description: 'Beginning of a place name to complete (at least 2 characters)',
		displayOptions: { show: show('autosuggest') },
	},
	...latLonFields(show('nearby'), 'the center point'),
	{
		displayName: 'Radius (Meters)',
		name: 'radius',
		type: 'number',
		default: 1000,
		typeOptions: { minValue: 1, maxValue: 5000 },
		description: 'Search radius around the center point, in meters (max 5000)',
		displayOptions: { show: show('nearby') },
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1 },
		description: 'Maximum number of places to return',
		displayOptions: { show: show('search') },
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 20,
		typeOptions: { minValue: 1 },
		description: 'Maximum number of places to return, nearest first',
		displayOptions: { show: show('nearby') },
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 5,
		typeOptions: { minValue: 1, maxValue: 20 },
		description: 'Maximum number of suggestions to return (max 20)',
		displayOptions: { show: show('autosuggest') },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: show('autosuggest') },
		options: [
			{
				displayName: 'Bounding Box',
				name: 'boundingBox',
				type: 'fixedCollection',
				default: {},
				description: 'Only suggest places inside this box (decimal degrees)',
				options: [
					{
						displayName: 'Box',
						name: 'box',
						values: [
							{
								displayName: 'Max Latitude',
								name: 'maxLat',
								type: 'number',
								default: 0,
								typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
							},
							{
								displayName: 'Max Longitude',
								name: 'maxLon',
								type: 'number',
								default: 0,
								typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
							},
							{
								displayName: 'Min Latitude',
								name: 'minLat',
								type: 'number',
								default: 0,
								typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
							},
							{
								displayName: 'Min Longitude',
								name: 'minLon',
								type: 'number',
								default: 0,
								typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
							},
						],
					},
				],
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. il',
				description: 'Only suggest places in this country (ISO 3166-1 alpha-2 code)',
			},
			...biasFields,
			{
				displayName: 'Radius (Meters)',
				name: 'radius',
				type: 'number',
				default: 5000,
				typeOptions: { minValue: 1 },
				description:
					'Only suggest places within this distance of the near point, in meters. Requires Near Latitude and Near Longitude.',
			},
		],
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: show('search') },
		options: [
			categoryField,
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. IL',
				description: 'Only return places in this country (ISO 3166-1 alpha-2 code)',
			},
			...biasFields,
		],
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: show('nearby') },
		options: [categoryField],
	},
];
