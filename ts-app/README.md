# TypeScript Worker, Workflows & Activities

## Install

-   `brew install temporal`
-   `npm install`

## Development

-   `npm run temporal`
-   `npm run worker`
-   `npm run client`

## Production

Requires `.env` file with the following:

```
TEMPORAL_ADDRESS = "{hostname|address}:7233"
```

-   `npm run build`
-   `npm run start`
-   `npm run submit`
