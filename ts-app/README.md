# TypeScript Worker, Workflows & Activities

## Install

-   `brew install temporal`
-   `npm install`

## Development

-   `npm run temporal`
-   `npm run worker`
-   `npm run client`

When running the CLI in development mode, it defaults to the `out` directory. The contents in this directory are excluded in the `.gitignore` file and running `npm run clean` will both clear the `lib` directory as well as the contents of this folder.

## Production

Requires `.env` file with the following:

```
TEMPORAL_ADDRESS = "{hostname|address}:7233"
```

-   `npm run build`
-   `npm run start`
-   `npm run submit`
