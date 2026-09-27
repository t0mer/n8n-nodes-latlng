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
