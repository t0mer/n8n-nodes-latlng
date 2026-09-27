# @t0mer/n8n-nodes-latlng

[![npm](https://img.shields.io/npm/v/@t0mer/n8n-nodes-latlng.svg)](https://www.npmjs.com/package/@t0mer/n8n-nodes-latlng)
[![CI](https://github.com/t0mer/n8n-nodes-latlng/actions/workflows/ci.yml/badge.svg)](https://github.com/t0mer/n8n-nodes-latlng/actions/workflows/ci.yml)

An [n8n](https://n8n.io) community node for [LatLng](https://www.latlng.work). It covers forward and reverse
geocoding, place search, nearby places, autosuggest and place categories. It also renders static map
images and fetches vector tiles and TileJSON, all based on OpenStreetMap data.

> **Unofficial.** This package is not affiliated with, endorsed by or supported by LatLng.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Coordinates](#coordinates)
- [Options](#options)
- [Quota and errors](#quota-and-errors)
- [Attribution and usage terms](#attribution-and-usage-terms)
- [Development](#development)

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
- **Test** on the credential calls `GET /v1/places/categories` once, which counts against your quota.

## Operations

Every operation's description says what it returns and in which units. The node is also marked as
usable as an AI agent tool.

### Geocoding

| Operation | Description |
|---|---|
| **Forward** | Address or place name → coordinates and address details. Returns up to *Max Results* matches (default 10), best first. |
| **Reverse** | Latitude/longitude → the address at that point (street, city, postcode, country…). |

Example output (Forward, *Simplify* on, one item per match). Without **Language**, names come back
in the local language:

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

Reverse returns the same fields for the address at the point.

### Place

| Operation | Description |
|---|---|
| **Autosuggest** | Completes a partial name (at least 2 characters) as you type. Optional filters: near point, radius, country and bounding box. Default 5 results, max 20. |
| **Get Categories** | Lists every place category (about 40, e.g. `cafe`, `restaurant`, `pharmacy`). |
| **Nearby** | Places within a radius (meters, default 1000, max 5000) of a point, nearest first. Optional category filter. |
| **Search** | Places matching a name or keyword. Optional filters: near point, category and country. |

Example output (Nearby, one item per place, `distance_m` in meters):

```json
{ "id": "13516609157", "name": "Plaza Café", "category": "cafe", "lat": 32.0775717, "lon": 34.7739451, "distance_m": 36.9 }
```

Example output (Autosuggest, one item per suggestion):

```json
{ "name": "דיזנגוף", "type": "address", "category": "street", "lat": 32.0765505, "lon": 34.7746435, "distance_m": 162, "country": "IL" }
```

Get Categories outputs one item per category, e.g. `{ "category": "cafe", "osm_tag": "amenity:cafe" }`.
Use the `category` value in the Category filter.

### Static Map

| Operation | Description |
|---|---|
| **Get Image** | Renders a PNG or JPEG map (up to 2048×2048 pixels) as binary data in the field you choose (`data` by default). The file is named `latlng-map.png` or `latlng-map.jpg`. |

- **Framing:** *Center and Zoom* (latitude, longitude, zoom 0–20), or *Bounding Box* (min/max latitude
  and longitude; the zoom is fitted automatically).
- **Style:** light, dark (default), grayscale, black, white or contrast.
- **Markers:** latitude, longitude, color and a short label for each pin.
- **Paths:** a line through two or more points, with weight (pixels), color and opacity (0–1).
- **GeoJSON Overlay:** any GeoJSON object drawn on top of the map.

The JSON part of the output holds the request parameters (never the key) plus `fileName`, `mimeType`
and `fileSize`. If the request gets very long, for example with hundreds of markers, the API may reject
it. The error then suggests fewer markers or a simpler GeoJSON.

### Tile and Dataset (Maps key required)

| Resource | Operation | Description |
|---|---|---|
| Tile | **Get Metadata** | TileJSON for the LatLng base map: bounds, zoom range, layers and attribution. |
| Tile | **Get Vector Tile** | One Mapbox Vector Tile (`z`/`x`/`y`, zoom 0–15) as binary `application/x-protobuf`, named `{z}-{x}-{y}.pbf`. |
| Dataset | **Get Metadata** | TileJSON for one of your uploaded datasets. |
| Dataset | **Get Vector Tile** | One vector tile of a dataset (zoom 0–14). |

- TileJSON echoes your key inside the `tiles` URLs, so the node replaces it with `key=REDACTED` in the
  output.
- Tile coordinates are checked before the call: `z`, `x` and `y` must be whole numbers, with
  `0 ≤ x, y < 2^z`.

## Coordinates

You always enter **Latitude** and **Longitude** as two separate number fields in decimal degrees. The
node checks the ranges (latitude −90 to 90, longitude −180 to 180) before calling the API.

You never need to know the order a particular endpoint expects, because the node handles it:
- Query parameters use `lat`/`lon`.
- GeoJSON uses `[lon, lat]`. With *Simplify* on, results come back as flat `lat`/`lon` fields.
- Static maps use `lng,lat`.

## Options

| Option | Applies to | Description |
|---|---|---|
| **Simplify** | Geocoding, Place | On (default): one item per result, with flat fields. Off: the raw API response as one item. |
| **Include Rate Limit Info** | all | Adds `rateLimit: { limit, remaining }` from the `X-RateLimit-*` response headers. |
| **Language** | Geocoding → Forward | Preferred language for names, e.g. `en`, `de`, `he`. |
| **Return Empty Item** | Geocoding, Place (with Simplify) | If nothing is found, output `{ "found": false, "query": … }` instead of no item. |
| **Timeout** | all | Request timeout in milliseconds (default 10000). |

Each output item is paired with its input item. With **Continue On Fail**, a failed item becomes
`{ "error": "…", "statusCode": 401 }` and the rest of the batch keeps running.

## Quota and errors

- LatLng uses **one shared quota for all calls**: the free plan allows **3,000 calls per day**. Every
  call counts, including tiles, static maps and the credential test.
- `429` and `5xx` responses are retried at most twice (after 1 s and 3 s). Other errors are not
  retried, because every retry costs quota.

| Status | Error shown |
|---|---|
| 400 | `Bad request: <message from the API>` |
| 401 | `Invalid API key` |
| 403 | `Key not allowed for this endpoint (server vs maps key, or domain restriction)` |
| 429 | `LatLng quota exceeded; resets daily on the free plan` |

API keys never appear in node output or error messages.

## Attribution and usage terms

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the
[ODbL](https://opendatacommons.org/licenses/odbl/). If you publish a static map image, show this
attribution visibly near it.

Your use of the API is subject to LatLng's terms and plan limits. See [latlng.work](https://www.latlng.work).

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
`test/fixtures/live/`. It makes about 10 calls, so don't run it in a loop. Set `LATLNG_DATASET_ID` to also check a dataset.

Releases are published by pushing a `YYYY.M.PATCH` tag. See `.github/workflows/publish.yml`.

## License

[MIT](https://github.com/t0mer/n8n-nodes-latlng/blob/main/LICENSE)
