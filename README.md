# MongoDB Documentation Search Indexer & Query Server

REST server that indexes search documents within an Atlas cluster and handles user search requests, deployed via Kanopy

## Components

### Marian Server
REST server that exposes endpoints to run queries against Atlas DB.

### Atlas Admin Manager
Module to invoke Atlas Admin commands via the [Atlas Admin API](https://www.mongodb.com/docs/atlas/reference/api-resources-spec/), specifically manages the Atlas Search Index for Search DB.

### Search Index
Service to read and write from Atlas DB. Transports input manifest documents into Atlas DB. Also reads DB results for server requests and returns formatted responses.

### Query
Query class that builds aggregation operations based off request query parameters.

## Installation

```shell
npm install
```

Create a .env file and copy over the contents of `sample.env`. Some values may have to be added or replaced.
If adding a new environment variable, please add the name and a sample value to the `sample.env`.

## Running locally

```shell
$ npm run build
$ npm run search-transport
```

The server will be running on port 8080. To make a query, make a request to `localhost:8080/search?q=<your query here>` using the browser, Postman, etc.

Available query parameters:
- (required) `q` - string to be queried (e.g. `findbyidandupdate`)
- (optional) `searchProperty` - which docs property the query should be refined by (e.g. `manual`)
- (optional) `page` - which page of results to display (e.g. `2`)
- (optional) `facets` - a list of selected facets/subfacets in the format `target_product>product>subproduct`

A node debugger (ie. [chrome developer tools](https://nodejs.org/en/docs/guides/debugging-getting-started/#inspector-clients)) can be connected to the built JS files.

## Staging
All commits merged to `main` deploy via Kanopy to a staging instance. 
The staging instance is viewable at https://docs-search-transport.docs.staging.corp.mongodb.com/status. 

## Releasing
New release tags automatically begin deployment via Kanopy to production instances.

Cutting a release with a new tag via the [Github UI](https://github.com/mongodb/docs-search-transport/releases/new) is the recommended method of deploying to production. As a matter of practice, release tags should be cut from `main`.

## Testing

Tests can be run using:

```shell
npm test  # alias for npm run test
```

### Unit tests

Tests are located in the `tests` directory, and run via `mocha`.

```shell
npm run test
```

## Linting & Style

We use [ESLint](https://eslint.org) and [Prettier](https://prettier.io) to help with linting and style.

### Lint

```shell
npm run lint:fix
```

### Style

To format code using Prettier, run the following command:

```shell
npm run format:fix
```

We have set up a precommit hook that will format staged files. Prettier also offers a variety of editor integrations to automatically format your code.
