# TypeScript Worker, Workflows & Activities

## Install

-   `brew install temporal`

## Development

-   `npm install`
-   `npm run temporal`
-   `npm run worker`
-   `npm run submit`

When running the CLI in development mode, it defaults to an `out` directory. The contents in this directory are excluded in the `.gitignore` file and running `npm run clean` will delete the contents of the folder, in addition to clearing any builds in the `lib` directory.

## Production

Requires `.env` file with the following:

```
TEMPORAL_ADDRESS = "{hostname|address}:7233"
```

-   `npm run build`
-   `npm run worker.prod`
-   `npm run submit.prod`
