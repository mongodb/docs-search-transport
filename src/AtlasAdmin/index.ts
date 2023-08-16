// @ts-ignore
import Logger from 'basic-logger';
import { MongoClient } from 'mongodb';
import { request, RequestOptions } from 'urllib';

import { getSynonymUpdateOperations, getFacetKeys } from './utils';
import { SearchIndex } from '../data/atlas-search-index';
import { SearchIndexResponse, IndexMappings, SynonymDocument } from '../data/atlas-types';
import { Taxonomy } from '../SearchIndex/types';

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
const SYNONYM_COLLECTION_NAME = process.env['SYNONYM_COLLECTION_NAME'] || 'synonyms';
const DB = process.env['ATLAS_DATABASE'] || 'search';
const SEARCH_INDEX = 'default';

/**
 * Manager is intended to keep Atlas Search Index in sync across environments
 * Index should be edited in ../data directory and expect to be updated on deploy
 */
export class AtlasAdminManager {
  private readonly baseUrl: string;
  private readonly mongoClient: MongoClient;

  constructor(publicApiKey: string, privApiKey: string, groupId: string, mongoClient: MongoClient) {
    DEFAULT_ATLAS_API_OPTIONS['digestAuth'] = `${publicApiKey}:${privApiKey}`;
    // set base url
    this.baseUrl = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${CLUSTER_NAME}/fts/indexes`;
    this.mongoClient = mongoClient;
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
      throw e;
    }
  }

  async updateSynonyms(): Promise<void> {
    console.log('Updating synonyms');

    const synonymCollection = this.mongoClient.db(DB).collection<SynonymDocument>(SYNONYM_COLLECTION_NAME);

    const synonymUpdates = getSynonymUpdateOperations('../../resources/synonyms.csv');

    try {
      // we want to ensure that the primary property is a unique index
      // so that we prevent duplicate synonym records.
      // the createIndex method is idempotent, so calling it repeatedly will not cause side effects.
      await synonymCollection.createIndex({ primary: 1 }, { unique: true });
      await synonymCollection.bulkWrite(synonymUpdates, { ordered: false });
    } catch (error) {
      console.error('ERROR! Synonyms collection did not update successfully.', error);
    }
  }

  private async findSearchIndex(dbName: string, collection: string, indexName: string) {
    log.info('finding Atlas search index');
    const url = `${this.baseUrl}/${dbName}/${collection}`;
    const options = { ...DEFAULT_ATLAS_API_OPTIONS };
    options['method'] = 'GET';

    try {
      const { data, res } = await request<SearchIndexResponse[]>(url, options);
      if (res.statusCode !== 200) {
        log.error(res);
        throw res;
      }

      return data.find((index) => index.name === indexName);
    } catch (e) {
      log.error(`Error while fetching search index: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  private async createSearchIndex(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    log.info('creating Atlas search index');
    const url = this.baseUrl;
    const options = this.getPostPatchOptions(searchIndex, taxonomy);
    options['method'] = 'POST';

    try {
      const { data, res } = await request<SearchIndexResponse>(url, options);
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

    const options = this.getPostPatchOptions(searchIndex, taxonomy);
    options['method'] = 'PATCH';

    try {
      const { data, res } = await request<SearchIndexResponse>(url, options);
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

  private getPostPatchOptions(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    const options = { ...DEFAULT_ATLAS_API_OPTIONS };
    options['data'] = this.insertTaxonomyIntoSearchIndex(searchIndex, taxonomy);
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
  private insertTaxonomyIntoSearchIndex(searchIndex: IndexMappings, taxonomy: Taxonomy) {
    const keyList = getFacetKeys(taxonomy);
    searchIndex['mappings']['fields']['facets'] = {
      type: 'document',
      fields: {},
    };
    for (const facetKey of keyList) {
      searchIndex['mappings']['fields']['facets']['fields'][facetKey] = [
        {
          type: 'string',
          analyzer: 'lucene.keyword',
        },
        {
          type: 'stringFacet',
        },
      ];
    }
    return searchIndex;
  }
}
