// @ts-ignore
import Logger from 'basic-logger';
import { request, RequestOptions } from 'urllib';
import { SearchIndex } from './data/atlas-search-index';
import { IndexMappings } from './data/atlas-types';
import { Taxonomy } from './SearchIndex';

const DEFAULT_ATLAS_API_OPTIONS: RequestOptions = {
  headers: {
    'content-type': 'application/json',
  },
  dataType: 'json',
};

const log = new Logger({
  showTimestamp: true,
});

const CLUSTER_NAME = process.env['CLUSTER_NAME'] || 'Search';
const COLLECTION_NAME = process.env['COLLECTION_NAME'] || 'documents';
const GROUP_ID = process.env['GROUP_ID'] || '';
const DB = process.env['ATLAS_DATABASE'] || 'search';
const SEARCH_INDEX = 'default';

/**
 * Manager is intended to keep Atlas Search Index in sync across environments
 * Index should be edited in ../configs directory and expect to be updated on deploy
 */

export class AtlasAdminManager {
  defaultHeaders: RequestOptions;
  baseUrl: string;

  constructor(publicApiKey: string, privApiKey: string) {
    // set base headers
    this.defaultHeaders = DEFAULT_ATLAS_API_OPTIONS;
    this.defaultHeaders['digestAuth'] = `${publicApiKey}:${privApiKey}`;
    // set base url
    this.baseUrl = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${GROUP_ID}/clusters/${CLUSTER_NAME}/fts/indexes`;
  }

  async patchSearchIndex(taxonomy: Taxonomy) {
    log.info('patchSearchIndex');
    try {
      const index = await this.findSearchIndex(DB, COLLECTION_NAME, SEARCH_INDEX);
      if (!index) {
        return this.createSearchIndex(SearchIndex, taxonomy);
      }
      return this.updateSearchindex(index['indexID'], SearchIndex, taxonomy);
    } catch (e) {
      log.error(`Error while patching searching index: ${JSON.stringify(e)}`);
    }
  }

  private async findSearchIndex(db: string, collection: string, indexName: string) {
    log.info('finding Atlas search index');
    const url = `${this.baseUrl}/${db}/${collection}`;
    const options = DEFAULT_ATLAS_API_OPTIONS;
    options['method'] = 'GET';

    try {
      const { data, res } = await request(url, options);
      if (res.statusCode !== 200) {
        log.error(res);
        throw res;
      }

      return data.find((index: any) => index.name === indexName);
    } catch (e) {
      log.error(`Error while fetching search index: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async createSearchIndex(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    log.info('creating Atlas search index');
    const url = `${this.baseUrl}`;
    const options = this._getPostPatchOptions(searchIndex, taxonomy);
    options['method'] = 'POST';

    try {
      const { res, data } = await request(url, options);
      if (res.statusCode !== 200) {
        log.error(res);
        throw res;
      }

      return data;
    } catch (e) {
      log.error(`Error while creating new search index: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async updateSearchindex(indexId: string, searchIndex: IndexMappings, taxonomy: Taxonomy) {
    log.info('updating Atlas search index');
    const url = `${this.baseUrl}/${indexId}`;

    const options = this._getPostPatchOptions(searchIndex, taxonomy);
    options['method'] = 'PATCH';

    try {
      const { res, data } = await request(url, options);
      if (res.statusCode !== 200) {
        log.error(res);
        throw res;
      }

      return data;
    } catch (e) {
      log.error(`Error while updating search index: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private _getPostPatchOptions(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    const options = DEFAULT_ATLAS_API_OPTIONS;
    options['data'] = this._insertTaxonomyIntoSearchIndex(searchIndex, taxonomy);
    options['data'] = Object.assign(options['data'], {
      collectionName: COLLECTION_NAME,
      database: DB,
      name: SEARCH_INDEX,
    });
    return options;
  }

  /**
   * takes in Search Index config and parsed taxonomy toml
   * inserts into Search Index and returns
   * 
   * @param searchIndex 
   * @param taxonomy 
   * @returns Search Index with faceted indexes added from taxonomy
   */
  private _insertTaxonomyIntoSearchIndex(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    const keyList = getFacetKeys(taxonomy);
    searchIndex['mappings']['fields']['facets'] = {
      'type': 'document',
      'fields': {}
    };
    for (const facetKey of keyList) {
      searchIndex['mappings']['fields']['facets']['fields'][facetKey] = [{
        "type": "string",
      },{
        "type": "stringFacet",
      }]
    }
    return searchIndex;
  }
}

// TODO: possibly move to taxonomy utils
const getFacetKeys = (taxonomy: Taxonomy) => {
  const keyList: string[] = [];
  const pushKeys = (baseStr = '', currentRecord: Taxonomy) => {
    for (const key in currentRecord) {
      if (key === 'name') { continue; }
      const res = baseStr ? `${baseStr}→${key}`: key;
      for (const child of currentRecord[key]) {
        const name = child['name'];
        pushKeys(`${res}←${name}`, child as Taxonomy)
      }
      keyList.push(res);
    }
  }
  pushKeys('', taxonomy);
  return keyList;
};