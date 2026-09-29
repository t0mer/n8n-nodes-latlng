# @t0mer/n8n-nodes-latlng

[![npm](https://img.shields.io/npm/v/@t0mer/n8n-nodes-latlng.svg)](https://www.npmjs.com/package/@t0mer/n8n-nodes-latlng)
[![CI](https://github.com/t0mer/n8n-nodes-latlng/actions/workflows/ci.yml/badge.svg)](https://github.com/t0mer/n8n-nodes-latlng/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/t0mer/n8n-nodes-latlng/blob/main/LICENSE)

An [n8n](https://n8n.io) community node for [LatLng](https://www.latlng.work). It covers forward and reverse
geocoding, place search, nearby places, autosuggest and place categories. It also renders static map
images and fetches vector tiles and TileJSON, all based on OpenStreetMap data.

> **Unofficial.** This package is not affiliated with, endorsed by or supported by LatLng.

- [Demo](#demo)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Coordinates](#coordinates)
- [Options](#options)
- [Example workflows](#example-workflows)
- [Quota and errors](#quota-and-errors)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Attribution and usage terms](#attribution-and-usage-terms)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Demo

<video src="https://raw.githubusercontent.com/t0mer/n8n-nodes-latlng/main/docs/demo.mp4" controls muted width="100%"></video>

[![LatLng node demo: geocode Dizengoff Square, find cafés nearby, draw a static map. Click to play the video.](https://raw.githubusercontent.com/t0mer/n8n-nodes-latlng/main/docs/demo-poster.png)](https://github.com/t0mer/n8n-nodes-latlng/blob/main/docs/demo.mp4)

▶ [Watch the demo video (MP4, 43 s)](https://github.com/t0mer/n8n-nodes-latlng/blob/main/docs/demo.mp4)

The workflow is in [`demo/workflow.json`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/demo/workflow.json):
1. **Geocoding → Forward** looks up "Dizengoff Square, Tel Aviv".
2. **Place → Nearby** lists 5 cafés within 500 m of it.
3. **Static Map → Get Image** draws the square (red) and the cafés (blue).

Import the workflow and pick your LatLng credential in each LatLng node.

## Features

- **Geocoding:** address or place name → coordinates, and coordinates → address.
- **Places:** search by name, list places near a point, autosuggest partial names, list categories.
- **Static maps:** PNG or JPEG images with markers, returned as n8n binary data.
- **Vector tiles:** TileJSON and Mapbox Vector Tiles for the LatLng base map and your own datasets.
- **Flat output:** with *Simplify* on, one item per result with plain `lat`/`lon` fields.
- **Input checks:** coordinates, radius, zoom, tile coordinates, colors and GeoJSON are checked
  before any call, so a mistake does not spend quota.
- **Quota-aware:** optional rate limit info on every item, and at most two retries on `429`/`5xx`.
- **Key-safe:** API keys are removed from output and error messages.
- **AI agent tool:** the node is marked `usableAsTool`, so an n8n AI Agent can call it.

## Requirements

- A self-hosted n8n instance that can install community nodes.
- A LatLng account and a **server key** (`latlng_…`). A **Maps key** (`pk_latlng_…`) is needed only
  for the Tile and Dataset resources.
- Outbound HTTPS from n8n to `api.latlng.work`, `suggest.latlng.work` and `tiles.latlng.work`.

## Installation

**From the n8n UI** (self-hosted n8n):

1. Go to **Settings → Community Nodes → Install**.
2. Enter `@t0mer/n8n-nodes-latlng` and confirm.

**Manually** (e.g. Docker or queue mode):

```bash
cd ~/.n8n/nodes
npm install @t0mer/n8n-nodes-latlng
# restart n8n
```

See the n8n docs on [installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

Each release is published from GitHub Actions with an
[npm provenance](https://docs.npmjs.com/generating-provenance-statements) statement.

## Credentials

Create a **LatLng API** credential. You get keys from the LatLng dashboard at
[dash.latlng.work](https://dash.latlng.work).

| Field | Key type | Needed for |
|---|---|---|
| **API Key (Server Key)**, required | `latlng_…` | Geocoding, Place (including Autosuggest), Static Map. Sent as the `X-Api-Key` header. |
| **Maps Key**, optional | `pk_latlng_…` | Tile and Dataset. Sent as the `key` query parameter to the tiles host. |

- Put the **server key** in the API Key field. A Maps key (`pk_latlng_…`) there makes the server-only
  endpoints answer `403`.
- Tile and Dataset operations fail with a clear error if the Maps key is empty. Dataset tiles accept
  only a Maps key that belongs to the dataset owner.
- **Test** on the credential calls `GET https://api.latlng.work/v1/places/categories` once with the
  server key, which counts against your quota. It does not check the Maps key.

## Operations

Every operation's description says what it returns and in which units. The node is also marked as
usable as an AI agent tool.

### Geocoding

| Operation | Description |
|---|---|
| **Forward** | Address or place name → coordinates and address details. Returns up to *Max Results* matches (default 10), best first. |
| **Reverse** | Latitude/longitude → the address at that point (street, city, postcode, country…). |

| Parameter | Operation | Default | Notes |
|---|---|---|---|
| **Address or Place** | Forward | — | Required. Free text, e.g. `Dizengoff Square, Tel Aviv`. |
| **Max Results** | Forward | `10` | Minimum 1. |
| **Latitude**, **Longitude** | Reverse | `0` | Required, decimal degrees. |

Example output (Forward, *Simplify* on, one item per match, some fields left out). Without
**Language**, names come back in the local language:

```json
{
  "name": "כיכר דיזנגוף",
  "lat": 32.0779938,
  "lon": 34.7743493,
  "osm_type": "R",
  "osm_id": 13645250,
  "osm_value": "square",
  "type": "locality",
  "city": "תל אביב–יפו",
  "country": "ישראל",
  "countrycode": "IL",
  "extent": [34.7738809, 32.0782606, 34.7745159, 32.077723]
}
```

Reverse returns the same fields for the address at the point. With *Simplify* on, every property of
the result is kept as a top-level field. A result whose geometry is not a point keeps it in `geometry`.

### Place

| Operation | Description |
|---|---|
| **Autosuggest** | Completes a partial name (at least 2 characters) as you type. Optional filters: near point, radius, country and bounding box. Default 5 results, max 20. |
| **Get Categories** | Lists every place category (about 40, e.g. `cafe`, `restaurant`, `pharmacy`). |
| **Nearby** | Places within a radius (meters, default 1000, max 5000) of a point, nearest first. Optional category filter. |
| **Search** | Places matching a name or keyword. Optional filters: near point, category and country. |

| Parameter | Operation | Default | Notes |
|---|---|---|---|
| **Search Query** | Search | — | Required. Name or keyword, e.g. `coffee`. |
| **Partial Query** | Autosuggest | — | Required, at least 2 characters, e.g. `Dizen`. |
| **Latitude**, **Longitude** | Nearby | `0` | Required, the center point. |
| **Radius (Meters)** | Nearby | `1000` | Whole number from 1 to 5000. |
| **Max Results** | Search / Nearby / Autosuggest | `10` / `20` / `5` | Autosuggest is capped at 20. |

Filters (all optional):

| Filter | Search | Nearby | Autosuggest | Notes |
|---|:-:|:-:|:-:|---|
| **Category** | ✓ | ✓ | | A value from Get Categories, e.g. `cafe`. |
| **Country** | ✓ | | ✓ | ISO 3166-1 alpha-2 code, e.g. `IL`. |
| **Near Latitude**, **Near Longitude** | ✓ | | ✓ | Ranks results by distance. Set both or neither. |
| **Radius (Meters)** | | | ✓ | Default 5000. Needs the near point. |
| **Bounding Box** | | | ✓ | Min/max latitude and longitude. Boxes that cross the 180° meridian are not supported. |

Example output (Nearby, one item per place, `distance_m` in meters, some fields left out):

```json
{ "id": "13516609157", "name": "Plaza Café", "category": "cafe", "lat": 32.0775717, "lon": 34.7739451, "distance_m": 36.9 }
```

Example output (Autosuggest, one item per suggestion, some fields left out):

```json
{ "name": "דיזנגוף", "type": "address", "category": "street", "lat": 32.0765505, "lon": 34.7746435, "distance_m": 162, "country": "IL" }
```

Get Categories outputs one item per category, e.g. `{ "category": "cafe", "osm_tag": "amenity:cafe" }`.
Use the `category` value in the Category filter.

### Static Map

| Operation | Description |
|---|---|
| **Get Image** | Renders a PNG or JPEG map (up to 2048×2048 pixels) as binary data in the field you choose (`data` by default). The file is named `latlng-map.png` or `latlng-map.jpg`. |

- **Framing:** *Center and Zoom* (latitude, longitude, zoom 0–20, default 14), or *Bounding Box*
  (min/max latitude and longitude; the zoom is fitted automatically). Boxes that cross the 180°
  meridian are not supported.
- **Width** and **Height:** 1–2048 pixels, default 800×600.
- **Style:** light, dark (default), grayscale, black, white or contrast.
- **Format:** PNG (default) or JPEG.
- **Markers:** latitude, longitude, color (hex, default `#e11d48`) and a short label for each pin.
- **Paths:** a line through two or more points, with weight (pixels, default 3), color (default
  `#2563eb`) and opacity (0–1, default 0.8).
- **GeoJSON Overlay:** any GeoJSON object with a `type` (Feature, FeatureCollection or geometry) to draw
  on top of the map. Coordinates are `[longitude, latitude]`.
- **Put Output File in Field:** the binary field name, default `data`.

Colors accept hex values with or without `#`, e.g. `e11d48` or `#e11d48`.

> **Current API behavior (checked September 2026):** the live API draws markers in the chosen color,
> but it does not draw marker labels, paths or GeoJSON overlays. The request still succeeds; those
> parts are just missing from the image. The node sends them as LatLng documents them, so they
> should start working if the API adds support.

The JSON part of the output holds the request parameters (`center` and `zoom`, or `bbox`, then
`width`, `height`, `style`, `format`, and `markers`, `path` and `geojson` when set; never the key)
plus `fileName`, `mimeType` and `fileSize` (bytes). If the request gets very long, for example with
hundreds of markers, the API may reject it. The error then suggests fewer markers or a simpler
GeoJSON.

### Tile and Dataset (Maps key required)

| Resource | Operation | Description |
|---|---|---|
| Tile | **Get Metadata** | TileJSON for the LatLng base map: bounds, zoom range, layers and attribution. |
| Tile | **Get Vector Tile** | One Mapbox Vector Tile (`z`/`x`/`y`, zoom 0–15) as binary `application/x-protobuf`, named `{z}-{x}-{y}.pbf`. |
| Dataset | **Get Metadata** | TileJSON for one of your uploaded datasets. |
| Dataset | **Get Vector Tile** | One vector tile of a dataset (zoom 0–14). |

| Parameter | Operation | Default | Notes |
|---|---|---|---|
| **Dataset ID** | Dataset → both | — | Required, e.g. `ds_abc123xyz`. Letters, digits, `_` and `-` only. |
| **Zoom (Z)**, **Column (X)**, **Row (Y)** | Get Vector Tile | `0` | XYZ scheme, row 0 at the top. |
| **Put Output File in Field** | Get Vector Tile | `data` | Binary field name. |

- Get Metadata outputs the TileJSON as one item. TileJSON echoes your key inside the `tiles` URLs,
  so the node replaces it with `key=REDACTED` in the output.
- Get Vector Tile outputs `z`, `x`, `y`, `fileName`, `mimeType` and `fileSize` as JSON, with the tile
  as binary data.
- Tile coordinates are checked before the call: `z`, `x` and `y` must be whole numbers, with
  `0 ≤ x, y < 2^z`.

## Coordinates

You always enter **Latitude** and **Longitude** as two separate number fields in decimal degrees. The
node checks the ranges (latitude −90 to 90, longitude −180 to 180) before calling the API. Values
set by an expression may be numbers or numeric strings.

You never need to know the order a particular endpoint expects, because the node handles it:
- Query parameters use `lat`/`lon`.
- GeoJSON uses `[lon, lat]`. With *Simplify* on, results come back as flat `lat`/`lon` fields.
- Static maps use `lng,lat`, and bounding boxes use `minLng,minLat,maxLng,maxLat`.

## Options

| Option | Applies to | Description |
|---|---|---|
| **Simplify** | Geocoding, Place | On (default): one item per result, with flat fields. Off: the raw API response as one item. |
| **Include Rate Limit Info** | all | Adds `rateLimit: { limit, remaining }` from the `X-RateLimit-*` response headers. A value is `null` when the API does not send that header. |
| **Language** | Geocoding → Forward | Preferred language for names, e.g. `en`, `de`, `he`. |
| **Return Empty Item** | Geocoding, Place (with Simplify) | If nothing is found, output `{ "found": false, "query": … }` instead of no item. |
| **Timeout** | all | Request timeout in milliseconds (default 10000). |

Each output item is paired with its input item. With **Continue On Fail**, a failed item becomes
`{ "error": "…", "statusCode": 401 }` and the rest of the batch keeps running. `statusCode` is only
set when the API answered with an error status; input check failures have `error` only.

## Example workflows

Import any of these from
[`examples/`](https://github.com/t0mer/n8n-nodes-latlng/tree/main/examples) with **Workflows →
Import from File**. The addresses, spreadsheet URL and chat ID are placeholders; replace them with
your own and select your LatLng (and Google Sheets, Telegram or OpenAI) credentials after importing.

| File | What it does |
|---|---|
| [`geocode-google-sheets-addresses.json`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/examples/geocode-google-sheets-addresses.json) | Reads addresses from Google Sheets, geocodes the rows that have no coordinates yet, and writes `lat`, `lon`, city, country and a status back to the sheet. |
| [`reverse-geocode-webhook-location.json`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/examples/reverse-geocode-webhook-location.json) | A webhook that takes `{ "lat": …, "lon": … }` and responds with the street address at that point. |
| [`static-map-to-telegram.json`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/examples/static-map-to-telegram.json) | Geocodes an address, renders a static map with a pin on it, and sends the image to a Telegram chat with an OpenStreetMap attribution caption. |
| [`ai-agent-nearby-places-tool.json`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/examples/ai-agent-nearby-places-tool.json) | An AI Agent that uses the node as two tools (geocoding and nearby places) to answer "find a pharmacy near Dizengoff Square". |

## Quota and errors

- The free plan has **daily limits**, and the live API applies them **per endpoint**. According to
  LatLng's pricing and the API's response headers, that is, for example, 3,000 geocoding and 300
  reverse geocoding calls per day, with places on a separate, smaller bucket. Every call counts,
  including tiles, static maps and the credential test. Turn on **Include Rate Limit Info** to see
  the actual limit and remaining calls for your key.
- `429` and `5xx` responses are retried at most twice (after 1 s and 3 s). Other errors, including
  timeouts and network failures, are not retried, because every retry costs quota.

| Status | Error shown |
|---|---|
| 400 | `Bad request: <message from the API, or "invalid parameters">` |
| 401 | `Invalid API key` |
| 403 | `Key not allowed for this endpoint (server vs maps key, or domain restriction)` |
| 414 | `Request URL too long: use fewer markers or paths, or a simpler GeoJSON overlay` |
| 429 | `LatLng quota exceeded; resets daily on the free plan` |
| 5xx | `LatLng server error (<status>)` |
| other | `LatLng request failed with status <status>` |
| no response | `Could not reach LatLng: <reason>` (timeout, DNS or TLS failure) |

For statuses other than 400, the API's own message, if any, is shown as the error description.
When a static map request with a very long query fails with 400, the description adds: `The map
request is very long: use fewer markers or paths, or a simpler GeoJSON overlay.`
Input check errors (for example `Latitude must be a number between -90 and 90 (got 95) [item 0]`)
name the field and the input item.

API keys never appear in node output or error messages.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Key not allowed for this endpoint …` on Geocoding, Place or Static Map | A Maps key (`pk_latlng_…`) is in the API Key field. Use the server key (`latlng_…`) there. The error can also come from a domain restriction on the key. |
| `The Tiles and Dataset resources need a Maps key (pk_latlng_…)` | Add the Maps key to the LatLng API credential. |
| `Set both Near Latitude and Near Longitude, or neither` | Search and Autosuggest need both near-point filters, or none. |
| `Radius needs Near Latitude and Near Longitude` | The Autosuggest radius filter only works with a near point. |
| `Bounding box minimum must be south-west of the maximum …` | Swap the min and max values. Boxes across the 180° meridian are not supported. |
| No output items | Nothing was found. Turn on **Return Empty Item** to get a `found: false` item instead. |
| Marker labels, paths or GeoJSON are missing from the map | The live API does not draw them yet (see [Static Map](#static-map)). |
| Names in the local language | Set the **Language** option on Geocoding → Forward. |

## Security notes

- Store keys only in the n8n **LatLng API** credential. Both key fields are masked.
- The server key is sent in the `X-Api-Key` header. The Maps key is sent as a `key` query parameter,
  as the tiles host requires; it is public by design but still spends your quota.
- The node removes keys from TileJSON output and from error messages.
- Restrict your keys in the LatLng dashboard where it offers that, and rotate a key if it leaks.
- The node only calls the three fixed LatLng hosts; the base URL cannot be changed.

## Attribution and usage terms

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the
[ODbL](https://opendatacommons.org/licenses/odbl/). If you publish a static map image, show this
attribution visibly near it.

Your use of the API is subject to LatLng's terms and plan limits. See the [LatLng terms](https://www.latlng.work/terms).

## Development

```bash
npm install
npm run lint     # n8n-node lint (strict)
npm run build
npm test         # unit tests, no network
npm run dev      # n8n with this node loaded, at http://localhost:5678
```

`npm run smoke` calls each operation once against the real API, using keys from a local `.env` file
(`LATLNG_API_KEY`, and optionally `LATLNG_MAPS_KEY`). It writes sanitized responses to
`test/fixtures/live/`. It makes about 10 calls, so don't run it in a loop. Set both `LATLNG_DATASET_ID`
and `LATLNG_MAPS_KEY` to also check a dataset.

`npm run demo:record` records the demo video with Playwright, using `LATLNG_API_KEY` from `.env`. It
needs `ffmpeg` on your `PATH`, starts a throwaway n8n instance in `~/.n8n-latlng-demo`, costs 3 API
calls per run, and writes `docs/demo.mp4` and `docs/demo-poster.png`.

Project layout:

```
credentials/LatLngApi.credentials.ts   LatLng API credential
nodes/LatLng/LatLng.node.ts            node definition
nodes/LatLng/descriptions/             parameters per resource
nodes/LatLng/actions/                  operation handlers
nodes/LatLng/shared/                   transport, errors, coordinates, static map builder, redaction
test/                                  unit tests and sanitized live fixtures
examples/                              example workflows
demo/                                  demo workflow and recording script
scripts/                               smoke test, package scan, next-version helper
```

CI runs lint, build, tests, the n8n community package scanner and a Trivy scan on every push to
`main` and on pull requests. Releases are published by pushing a `YYYY.M.PATCH` tag. See
[`.github/workflows/publish.yml`](https://github.com/t0mer/n8n-nodes-latlng/blob/main/.github/workflows/publish.yml).

## Contributing

Issues and pull requests are welcome at
[github.com/t0mer/n8n-nodes-latlng/issues](https://github.com/t0mer/n8n-nodes-latlng/issues). Please run
`npm run lint`, `npm run build` and `npm test` before opening a pull request. Tests must not call the
live API.

## License

[MIT](https://github.com/t0mer/n8n-nodes-latlng/blob/main/LICENSE) © 2026 t0mer
