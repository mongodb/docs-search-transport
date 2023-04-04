# MongoDB Documentation Search Indexer & Query Server

## Installation

```shell
npm install
```

Make sure that you have `mongod` running locally with port 27017 open. 

## Running locally

```shell
$ npm run build
$ npm run search-transport
```

A node debugger (ie. [chrome developer tools](https://nodejs.org/en/docs/guides/debugging-getting-started/#inspector-clients)) can be connected to the built JS files.

## Staging
All commits merged to `main` deploy via Kanopy to a staging instance. 
The staging instance is viewable at https://docs-search-transport.docs.staging.corp.mongodb.com/status. 

## Releasing
We have configured an automatic release process using [GitHub Actions](https://github.com/features/actions) that is triggered by [npm-version](https://docs.npmjs.com/cli/version).

Cutting a release with a new tag via the [Github UI](https://github.com/mongodb/docs-search-transport/releases/new) is the recommended method of deploying to production. As a matter of practice, release tags should be cut from `main`.

## Testing

Tests can be run using:

```shell
npm test  # alias for npm run test
```

### Unit tests

Unit tests are located in the `tests` directory. To run only unit tests, use:

```shell
npm run test:unit
```

### Running individual suites

Jest includes configurations for running individual test suites:

```shell
npm test -- my-test   # or
npm test -- path/to/my-test.js
```

For more information, see the [Jest CLI Options](https://jestjs.io/docs/en/cli) documentation, or run `npm test -- --help`.

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
