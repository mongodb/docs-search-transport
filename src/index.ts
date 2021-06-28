#!/usr/bin/env ts-node
'use strict';

import { MongoClient } from 'mongodb';
import assert from 'assert';
import http from 'http';
import { parse as parseUrl, UrlWithParsedQuery } from 'url';

// @ts-ignore
import Logger from 'basic-logger';

import { Query } from './Query';
import { isPermittedOrigin } from './util';
import { SearchIndex, RefreshInfo } from './SearchIndex';

process.title = 'search-transport';

const MAXIMUM_QUERY_LENGTH = 100;

const STANDARD_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'deny',
};

const MANIFEST_URI_KEY = 'MANIFEST_URI';
const ATLAS_URI_KEY = 'ATLAS_URI';
const DATABASE_NAME_KEY = 'ATLAS_DATABASE';
const DEFAULT_DATABASE_NAME = 'search';

const log = new Logger({
  showTimestamp: true,
});

interface StatusResponse {
  manifests: string[];
  lastSync?: RefreshInfo | null;
}

function checkAllowedOrigin(origin: string | undefined, headers: Record<string, string>): void {
  if (origin && isPermittedOrigin(new URL(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
}

/**
 * If the request method does not match the method parameter, return false
 * and write a 405 status code. Otherwise return true.
 */
function checkMethod(req: http.IncomingMessage, res: http.ServerResponse, method: string): boolean {
  if (req.method !== method) {
    res.writeHead(405, {});
    res.end('');
    return false;
  }

  return true;
}

class InvalidQuery extends Error {}

class Marian {
  index: SearchIndex;

  constructor(index: SearchIndex) {
    this.index = index;

    // Fire-and-forget loading
    this.index
      .load()
      .then((result) => {
        if (result) {
          log.info(JSON.stringify(result));
        }
      })
      .catch((err) => {
        log.error(err);
      });
  }

  start(port: number) {
    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        await this.handle(req, res);
      } catch (err) {
        log.error(err);
        res.writeHead(500, {});
        res.end('');
      }
    });

    server.listen(port, () => {
      log.info(`Listening on port ${port}`);
    });
  }

  handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url;
    if (!url) {
      assert.fail('Assertion: Missing url');
    }
    const parsedUrl = parseUrl(url, true);

    const pathname = (parsedUrl.pathname || '').replace(/\/+$/, '');

    if (pathname === '/search') {
      if (checkMethod(req, res, 'GET')) {
        this.handleSearch(parsedUrl, req, res);
      }
    } else if (pathname === '/refresh') {
      if (checkMethod(req, res, 'POST')) {
        this.handleRefresh(req, res);
      }
    } else if (pathname === '/status') {
      if (checkMethod(req, res, 'GET')) {
        this.handleStatus(parsedUrl, req, res);
      }
    } else {
      res.writeHead(400, {});
      res.end('');
    }
  }

  private async fetchResults(parsedUrl: UrlWithParsedQuery): Promise<any[]> {
    const rawQuery = (parsedUrl.query.q || '').toString();
    if (!rawQuery) {
      throw new InvalidQuery();
    }

    if (rawQuery.length > MAXIMUM_QUERY_LENGTH) {
      throw new InvalidQuery();
    }

    const query = new Query(rawQuery);

    let searchProperty = parsedUrl.query.searchProperty || null;
    if (typeof searchProperty === 'string') {
      searchProperty = [searchProperty];
    }
    return await this.index.search(query, searchProperty);
  }

  async handleSearch(
    parsedUrl: UrlWithParsedQuery,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };
    Object.assign(headers, STANDARD_HEADERS);

    checkAllowedOrigin(req.headers.origin, headers);

    let results;
    try {
      results = await this.fetchResults(parsedUrl);
    } catch (err) {
      if (err instanceof InvalidQuery) {
        res.writeHead(400, headers);
        res.end('[]');
        return;
      }

      throw err;
    }
    let responseBody = JSON.stringify(results);
    res.writeHead(200, headers);
    res.end(responseBody);
  }

  async handleRefresh(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const headers: Record<string, string> = {
      Vary: 'Accept-Encoding',
    };
    Object.assign(headers, STANDARD_HEADERS);

    try {
      await this.index.load();
    } catch (err) {
      log.error(err);
      headers['Content-Type'] = 'application/json';
      const body = JSON.stringify({ errors: [err] });

      if (err.message === 'already-indexing') {
        res.writeHead(503, headers);
      } else {
        res.writeHead(500, headers);
      }
      res.end(body);
      return;
    }

    if (this.index.lastRefresh && this.index.lastRefresh.errors.length > 0) {
      headers['Content-Type'] = 'application/json';
      const body = JSON.stringify({ errors: this.index.lastRefresh.errors });
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    res.writeHead(200, headers);
    res.end('');
  }

  async handleStatus(
    parsedUrl: UrlWithParsedQuery,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      Pragma: 'no-cache',
    };
    Object.assign(headers, STANDARD_HEADERS);

    checkAllowedOrigin(req.headers.origin, headers);

    if (this.index.manifests === null) {
      res.writeHead(503, headers);
      res.end('');
      return;
    }

    const response: StatusResponse = {
      manifests: this.index.manifests.map((manifest) => manifest.searchProperty),
    };

    if (parsedUrl.query.verbose) {
      response.lastSync = this.index.lastRefresh;
    }

    res.writeHead(200, headers);
    res.end(JSON.stringify(response));
  }
}

function help(): void {
  console.error(`Usage: search-transport [--create-indexes]

The following environment variables are used:
* ${MANIFEST_URI_KEY}
* ${ATLAS_URI_KEY}
* ${DATABASE_NAME_KEY} (defaults to "search")`);
}

async function main() {
  Logger.setLevel('info', true);

  if (
    process.argv.length < 2 ||
    process.argv.length > 3 ||
    process.argv.includes('--help') ||
    process.argv.includes('-h')
  ) {
    help();
    process.exit(1);
  }

  const manifestUri = process.env[MANIFEST_URI_KEY];
  const atlasUri = process.env[ATLAS_URI_KEY];

  let databaseName = DEFAULT_DATABASE_NAME;
  const envDBName = process.env[DATABASE_NAME_KEY];
  if (envDBName) {
    databaseName = envDBName;
  }

  if (!manifestUri || !atlasUri) {
    if (!manifestUri) {
      console.error(`Missing ${MANIFEST_URI_KEY}`);
    }
    if (!atlasUri) {
      console.error(`Missing ${ATLAS_URI_KEY}`);
    }
    help();
    process.exit(1);
  }

  const client = await MongoClient.connect(atlasUri, { useUnifiedTopology: true });
  const searchIndex = new SearchIndex(manifestUri, client, databaseName);

  if (process.argv[2] === '--create-indexes') {
    await searchIndex.createRecommendedIndexes();
  }

  const server = new Marian(searchIndex);
  server.start(8080);
}

try {
  main();
} catch (err) {
  console.error(err);
}
