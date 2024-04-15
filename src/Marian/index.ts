import assert from 'assert';
// @ts-ignore
import Logger from 'basic-logger';
import http from 'http';
import https from 'https';
import { parse } from 'toml';
import { Document } from 'mongodb';
import fetch, { RequestInit } from 'node-fetch';

import { checkAllowedOrigin, checkMethod } from './util';
import { StatusResponse } from './types';
import { SearchIndex } from '../SearchIndex';
import { FacetMeta, Taxonomy } from '../SearchIndex/types';
import { AtlasAdminManager } from '../AtlasAdmin';
import { setPropertyMapping } from '../SearchPropertyMapping';
import { Query, InvalidQuery } from '../Query';
import { extractFacetFilters } from '../Query/util';
import { sortFacets } from '../SearchIndex/util';

const STANDARD_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'deny',

  // allow CORS via credentials
  // https://kanopy.corp.mongodb.com/docs/security/corpsecure/#cors-simple-request-example
  'access-control-allow-credentials': true,
  'access-control-allow-methods': 'GET',
};

const LANGUAGE_PREFIXES = ['zh-cn', 'pt-br', 'ko-kr'];

const log = new Logger({
  showTimestamp: true,
});

const MAXIMUM_QUERY_LENGTH = 100;

export default class Marian {
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
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url, `http://${req.headers?.host}`);
    } catch (e) {
      log.warn(`URL constructor could not create a URL with url ${url} and base ${req.headers?.host}`);
      res.writeHead(500, {});
      res.end('');
      return;
    }
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
    } else if (LANGUAGE_PREFIXES.some((prefix) => pathname.startsWith(`/${prefix}`))) {
      if (checkMethod(req, res, 'GET')) {
        this.handleTranslationRequest(req, res);
      }
    } else if (pathname === '/manifests') {
      if (checkMethod(req, res, 'GET')) {
        this.handleManifests(req, res);
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
      log.error(`Error while handling search:`);
      log.error(err);
      if (err instanceof InvalidQuery) {
        res.writeHead(400, headers);
        res.end(err.message);
        return;
      }
      res.writeHead(500, headers);
      res.end();
      return;
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
    } catch (err: any) {
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

  async load(initLoad = true) {
    let taxonomy: Taxonomy;
    console.log(`initLoad ${initLoad}`);
    try {
      // TODO: include taxonomy url in verifyEnvVars after it has been released
      taxonomy = await this.fetchTaxonomy(process.env.TAXONOMY_URL!);
      await setPropertyMapping();
      if (!initLoad) {
        await this.index.load(taxonomy, undefined, false);
        return;
      }
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

  private async fetchResults(parsedUrl: URL): Promise<Document[]> {
    const rawQuery = (parsedUrl.searchParams.get('q') || '').toString();

    if (!rawQuery) {
      // allow blank query for facet data only
      throw new InvalidQuery();
    }

    if (rawQuery.length > MAXIMUM_QUERY_LENGTH) {
      throw new InvalidQuery();
    }

    const filters = extractFacetFilters(parsedUrl.searchParams);
    const query = new Query(rawQuery);

    let searchProperty = parsedUrl.searchParams.getAll('searchProperty') || null;
    if (typeof searchProperty === 'string') {
      searchProperty = [searchProperty];
    }
    const pageNumber = Number(parsedUrl.searchParams.get('page'));
    return this.index.search(query, searchProperty, filters, pageNumber);
  }

  private async fetchTaxonomy(url: string) {
    try {
      if (!url) {
        throw new Error('Taxonomy URL required');
      }
      const res = await fetch(url);
      const toml = await res.text();
      return parse(toml);
    } catch (e) {
      log.error(`Error while fetching taxonomy: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async handleStatusV2(req: http.IncomingMessage, res: http.ServerResponse) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };
    Object.assign(headers, STANDARD_HEADERS);
    checkAllowedOrigin(req.headers.origin, headers);
    const responseBody = JSON.stringify(this.index.responseFacets);
    res.writeHead(200, headers);
    res.end(responseBody);
  }

  private async fetchFacetMeta(parsedUrl: URL): Promise<FacetMeta> {
    const rawQuery = (parsedUrl.searchParams.get('q') || '').toString();
    if (!rawQuery || !rawQuery.length) {
      throw new InvalidQuery();
    }

    const filters = extractFacetFilters(parsedUrl.searchParams);
    const query = new Query(rawQuery);

    let searchProperty = parsedUrl.searchParams.getAll('searchProperty') || null;
    if (typeof searchProperty === 'string') {
      searchProperty = [searchProperty];
    }
    try {
      const res = await this.index.fetchFacets(query, searchProperty, filters);
      res.facets = sortFacets(res.facets);
      return res;
    } catch (e) {
      log.error(
        `Error fetching facet metadata for query ${rawQuery}, with search property ${searchProperty}, and filters ${filters}. ${JSON.stringify(
          e
        )}`
      );
      console.trace();
      throw e;
    }
  }

  // anything with /zh-cn for now.
  // ie. /zh-cn/search?q=test
  private async handleTranslationRequest(req: http.IncomingMessage, userRes: http.ServerResponse) {
    log.info('handleTranslationRequest');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Vary: 'Accept-Encoding, Origin',
      'Cache-Control': 'public,max-age=120,must-revalidate',
    };

    // extract headers (minus auth headers)
    // take out kanopy header
    const { cookie, 'x-kanopy-internal-authorization': kanopyInternal, ...ogHeaders } = req.headers;

    // extract path and query params
    // ie. /zh-cn/search?q=test
    const url = req.url || '';

    // call smartling API
    const SMARTLING_URL = new URL(url, `http://mongodbdocs.sl.smartling.com`);
    // ie. https://mongodbdocs.sl.smartling.com/zh-cn/search?q=test

    const reqOptions: https.RequestOptions = {
      headers: { ...req.headers, Accept: 'application/json' },
      hostname: 'mongodbdocs.sl.smartling.com',
      path: req.url,
      method: 'GET',
      checkServerIdentity: (hostname, cert) => {
        console.log('check hostname ', hostname);
        console.log(cert);
        return undefined;
      },
    };
    console.log('check reqOptions')
    console.log(reqOptions);

    try {
      const smartlingRes = await fetch(SMARTLING_URL.toString(), reqOptions as unknown as RequestInit);
      if (smartlingRes.status !== 200) {
        log.error(
          `Error while fetching local request ${SMARTLING_URL.toString()} with status code ${
            smartlingRes.status
          }: ${JSON.stringify(smartlingRes.statusText)}`
        );
        log.error(smartlingRes);
        userRes.writeHead(smartlingRes.status, smartlingRes.statusText);
        userRes.end();
        return;
      }
      const result = new Response(await smartlingRes.text());
      userRes.writeHead(200, headers);
      userRes.end(result);
    } catch (e) {
      log.error(`Error while fetching smartling request :`);
      log.error(e);
    }
  }

  private async handleManifests(req: http.IncomingMessage, res: http.ServerResponse) {
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

    const response = {
      manifests: this.index.manifests.map((manifest) =>
        new URL(`${this.index.manifestUrlPrefix}/${manifest.searchProperty}.json`).toString()
      ),
    };

    res.writeHead(200, headers);
    res.end(JSON.stringify(response));
  }
}
