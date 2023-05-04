import { request, RequestOptions } from 'urllib';

// @ts-ignore
import Logger from 'basic-logger';
import SearchIndexData from './configs/atlas-search-index.json';

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

  async patchSearchIndex() {
    log.info('patchSearchIndex');
    try {
      const index = await this.findSearchIndex(DB, COLLECTION_NAME, SEARCH_INDEX);
      if (!index) {
        return this.createSearchIndex(SearchIndexData);
      }
      return this.updateSearchindex(index['indexID'], SearchIndexData);
    } catch (e) {
      log.error(`Error while patching searching index: ${JSON.stringify(e)}`);
    }
  }

  private async findSearchIndex(
    db: string,
    collection: string,
    indexName: string
  ) {
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

  private async createSearchIndex(mappingsData: any ) {
    log.info('creating Atlas search index');
    const url = `${this.baseUrl}`;
    const options = this._getPostPatchOptions(mappingsData);
    options['method'] = 'POST';

    try {
      const { res, data } = await request(url, options);
      if (res.statusCode !== 200) {
        log.error(res);
        throw res;
      }
      if (data.length) {
        return data;
      }
    } catch (e) {
      log.error(`Error while creating new search index: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async updateSearchindex(
    indexId: string,
    mappingsData: any
  ) {
    log.info('updating Atlas search index');
    const url = `${this.baseUrl}/${indexId}`;

    // const options = DEFAULT_ATLAS_API_OPTIONS;
    const options = this._getPostPatchOptions(mappingsData);
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

  private _getPostPatchOptions(mappingsData: any) {
    const options = DEFAULT_ATLAS_API_OPTIONS;
    options['data'] = this._convertTaxonomyToMappings(null, mappingsData);
    options['data'] = Object.assign(options['data'], {
      collectionName: COLLECTION_NAME,
      database: DB,
      name: SEARCH_INDEX,
    });
    return options;
  }
  
  private _convertToString(facet: any) {
    
  }
  
  // TODO: should be a util function to convert input format of facet taxonomy
  // into facet keys by calling convertToString on some arbitrary object
  private _convertTaxonomyToMappings(file: any, mappingsData: any) {
    return mappingsData;
  }
}