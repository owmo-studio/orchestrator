# TypeScript Worker, Workflows & Activities

## Install

-   `brew install temporal`
-   `npm install`

## Development

-   `npm run temporal`
-   `npm run worker`
-   `npm run client`

The client suggests an `out` directory at the root of the repository as a default destination folder, to help with faster development cycles. It is excluded by `.gitignore` and deleted by the `npm run clean` command. When running in production, it will simply suggest the current directory.

## Production

Requires `.env` file with the following:

```
TEMPORAL_ADDRESS = "{hostname|address}:7233"
```

-   `npm run build`
-   `npm run start`
-   `npm run submit`
