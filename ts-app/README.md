# TypeScript Worker, Workflows & Activities

## Install

-   `brew install temporal`
-   `npm install`

## Development

-   `npm run temporal`
-   `npm run dev.watch`

## Production

-   `npm run build`
-   `npm run start.watch`

Required environment variables in `.env` file at root:

```
TEMPORAL_ADDRESS = "{hostname|address}:7233"
```

## Workflows

-   `npm run snapshot -- -u {URL} -o {output directory} -n {number}`
