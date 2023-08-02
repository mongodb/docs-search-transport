#!/usr/bin/env ts-node
'use strict';

import * as dotenv from 'dotenv';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

import { Document, Filter, MongoClient } from 'mongodb';
import assert from 'assert';
import http from 'http';
import { parse } from 'toml';

// @ts-ignore
import Logger from 'basic-logger';

import { taxonomy } from './data/sample-taxonomy';
import { Query, InvalidQuery, extractFacetFilters } from './Query';
import { isPermittedOrigin } from './util';
import { SearchIndex, RefreshInfo, Taxonomy, Document as SearchDocument } from './SearchIndex';
import { AtlasAdminManager } from './AtlasAdmin';

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
const GROUP_KEY = 'GROUP_ID';
const ADMIN_API_KEY = 'ATLAS_ADMIN_API_KEY';
const ADMIN_PUB_KEY = 'ATLAS_ADMIN_PUB_KEY';

const log = new Logger({
  showTimestamp: true,
});

interface StatusResponse {
  manifests: string[];
  lastSync?: RefreshInfo | null;
}

function checkAllowedOrigin(origin: string | undefined, headers: Record<string, string>): void {
  if (!origin) {
    return;
  }

  let url;
  try {
    url = new URL(origin);
  } catch (err) {
    return;
  }

  if (isPermittedOrigin(url)) {
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

class Marian {
  index: SearchIndex;
  atlasAdmin: AtlasAdminManager;

  constructor(index: SearchIndex, atlasAdmin: AtlasAdminManager) {
    this.index = index;
    this.atlasAdmin = atlasAdmin;
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
    const parsedUrl = new URL(url, `http://${req.headers.host}`);

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
    } else if (pathname === '/v2/search/meta') {
      if (checkMethod(req, res, 'GET')) {
        this.handleMetaSearch(parsedUrl, req, res);
      }
    } else if (pathname === '/v2/status') {
      if (checkMethod(req, res, 'GET')) {
        this.handleStatusV2(req, res);
      }
    } else if (pathname === '/v2/status') {
      if (checkMethod(req, res, 'GET')) {
        this.handleStatusV2(req, res);
      }
    } else {
      res.writeHead(400, {});
      res.end('');
    }
  }

  async handleSearch(parsedUrl: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };
    Object.assign(headers, STANDARD_HEADERS);

    checkAllowedOrigin(req.headers.origin, headers);

    let results: Document[];
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
    let responseBody = JSON.stringify({ results: results });
    res.writeHead(200, headers);
    res.end(responseBody);
  }

  async handleRefresh(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const headers: Record<string, string> = {
      Vary: 'Accept-Encoding',
    };
    Object.assign(headers, STANDARD_HEADERS);

    try {
      await this.load();
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

  async handleStatus(parsedUrl: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

    if (parsedUrl.searchParams.has('verbose')) {
      response.lastSync = this.index.lastRefresh;
    }

    res.writeHead(200, headers);
    res.end(JSON.stringify(response));
  }

  async load() {
    let taxonomy: Taxonomy;
    try {
      // TODO: include taxonomy url in verifyEnvVars after it has been released
      taxonomy = await this.fetchTaxonomy(process.env.TAXONOMY_URL!);
      await this.atlasAdmin.updateSynonyms();
      await this.atlasAdmin.patchSearchIndex(taxonomy);
      await this.index.load(taxonomy);
    } catch (e) {
      log.error(`Error while loading Marian server ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async handleMetaSearch(parsedUrl: URL, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // TODO: wrap requests with header assignment, configure response types
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };
    Object.assign(headers, STANDARD_HEADERS);
    checkAllowedOrigin(req.headers.origin, headers);

    let results;
    try {
      results = await this.fetchFacetMeta(parsedUrl);
      // TODO: format results as same as /v2/manifest
    } catch (err) {
      if (err instanceof InvalidQuery) {
        res.writeHead(400, headers);
      } else {
        res.writeHead(500, headers);
      }
      res.end('[]');
    }

    const responseBody = JSON.stringify(results);
    res.writeHead(200, headers);
    res.end(responseBody);
  }

  private async fetchResults(parsedUrl: URL): Promise<any[]> {
    const rawQuery = (parsedUrl.searchParams.get('q') || '').toString();

    if (!rawQuery) {
      // allow blank query for facet data only
      throw new InvalidQuery();
    }

    if (rawQuery.length > MAXIMUM_QUERY_LENGTH) {
      throw new InvalidQuery();
    }

    const filters = extractFacetFilters(parsedUrl.searchParams);
    const query = new Query(rawQuery, filters);

    let searchProperty = parsedUrl.searchParams.getAll('searchProperty') || null;
    if (typeof searchProperty === 'string') {
      searchProperty = [searchProperty];
    }

    return await this.index.search(query, searchProperty);
  }

  private async fetchTaxonomy(url: string) {
    // TODO: remove after taxonomy has been supplied. change env var
    return parse(taxonomy);
    // try {
    //   if (!url) {
    //     throw new Error('Taxonomy URL required');
    //   }
    //   const res = await fetch(url);
    //   const toml = await res.text();
    //   return parse(toml);
    // } catch (e) {
    //   // console.error(`Error while fetching taxonomy: ${JSON.stringify(e)}`);
    //   // throw e;
    //   console.log(`Returning test taxonomy with test toml`);
    //   return parse(taxonomy);
    // }
  }

  private async handleStatusV2(req: http.IncomingMessage, res: http.ServerResponse) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };
    Object.assign(headers, STANDARD_HEADERS);
    checkAllowedOrigin(req.headers.origin, headers);
    const responseBody = JSON.stringify(this.index.convertedTaxonomy);
    res.writeHead(200, headers);
    res.end(responseBody);
  }

  private async fetchFacetMeta(parsedUrl: URL): Promise<any> {
    const rawQuery = (parsedUrl.searchParams.get('q') || '').toString();
    if (!rawQuery || !rawQuery.length) {
      throw new InvalidQuery();
    }

    const filters = extractFacetFilters(parsedUrl.searchParams);
    const query = new Query(rawQuery, filters);

    try {
      return this.index.fetchFacets(query);
    } catch (e) {
      console.error(`Error fetching facet metadata: ${JSON.stringify(e)}`);
      throw e;
    }
  }
}

function help(): void {
  console.error(`Usage: search-transport [--create-indexes]

The following environment variables are used:
* ${MANIFEST_URI_KEY}
* ${ATLAS_URI_KEY}
* ${DATABASE_NAME_KEY} (defaults to "search")
* ${GROUP_KEY}
* ${ADMIN_API_KEY}
* ${ADMIN_PUB_KEY}
`);
}

function verifyAndGetEnvVars() {
  const manifestUri = process.env[MANIFEST_URI_KEY];
  const atlasUri = process.env[ATLAS_URI_KEY];
  const groupId = process.env[GROUP_KEY];
  const adminPubKey = process.env[ADMIN_PUB_KEY];
  const adminPrivKey = process.env[ADMIN_API_KEY];

  if (!manifestUri || !atlasUri || !groupId || !adminPrivKey || !adminPubKey) {
    if (!manifestUri) {
      console.error(`Missing ${MANIFEST_URI_KEY}`);
    }
    if (!atlasUri) {
      console.error(`Missing ${ATLAS_URI_KEY}`);
    }
    if (!groupId) {
      console.error(`Missing ${GROUP_KEY}`);
    }
    if (!adminPrivKey) {
      console.error(`Missing ${ADMIN_API_KEY}`);
    }
    if (!adminPubKey) {
      console.error(`Missing ${ADMIN_PUB_KEY}`);
    }
    // TODO: add taxonomy url
    help();
    process.exit(1);
  }

  return {
    manifestUri,
    atlasUri,
    groupId,
    adminPubKey,
    adminPrivKey,
  };
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

  const { manifestUri, atlasUri, groupId, adminPubKey, adminPrivKey } = verifyAndGetEnvVars();

  let databaseName = DEFAULT_DATABASE_NAME;
  const envDBName = process.env[DATABASE_NAME_KEY];
  if (envDBName) {
    databaseName = envDBName;
  }

  log.info(`Loading manifests from ${manifestUri}`);

  const client = await MongoClient.connect(atlasUri);
  const searchIndex = new SearchIndex(manifestUri, client, databaseName);

  if (process.argv[2] === '--create-indexes') {
    await searchIndex.createRecommendedIndexes();
  }

  const atlasAdmin = new AtlasAdminManager(adminPubKey, adminPrivKey, groupId, client);
  const server = new Marian(searchIndex, atlasAdmin);

  try {
    await server.load();
  } catch (e) {
    console.error(`Error while initializing server: ${JSON.stringify(e)}`);
    throw e;
  }
  server.start(8080);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
