import assert from 'assert';
// @ts-ignore
import Logger from 'basic-logger';
import { MongoClient, Collection, TransactionOptions, AnyBulkWriteOperation, Db, ClientSession } from 'mongodb';

import { convertTaxonomyResponse, formatFacetMetaResponse, getManifests, joinUrl } from './util';
import { Query } from '../Query';
import { Document, Manifest, DatabaseDocument, RefreshInfo, Taxonomy, FacetDisplayNames, FacetAggRes } from './types';

const log = new Logger({
  showTimestamp: true,
});

export class SearchIndex {
  currentlyIndexing: boolean;
  manifestSource: string;
  manifests: Manifest[] | null;

  client: MongoClient;
  db: Db;
  lastRefresh: RefreshInfo | null;
  documents: Collection<DatabaseDocument>;
  unindexable: Collection<DatabaseDocument>;
  taxonomy: Taxonomy;
  convertedTaxonomy: FacetDisplayNames;

  constructor(manifestSource: string, client: MongoClient, databaseName: string) {
    this.currentlyIndexing = false;
    this.manifestSource = manifestSource;
    this.manifests = null;

    this.client = client;
    this.db = client.db(databaseName);
    this.documents = this.db.collection<DatabaseDocument>('documents');
    this.unindexable = this.db.collection<DatabaseDocument>('unindexable');
    this.lastRefresh = null;
    this.taxonomy = {};
    this.convertedTaxonomy = {};
  }

  async search(query: Query, searchProperty: string[] | null, pageNumber?: number) {
    const aggregationQuery = query.getAggregationQuery(searchProperty);
    const RES_COUNT = 50;
    const PAGINATED_RES_COUNT = 10;
    aggregationQuery.push({
      $project: {
        _id: 0,
        title: 1,
        preview: 1,
        url: 1,
        searchProperty: 1,
      },
    });
    if (!pageNumber) {
      aggregationQuery.push({ $limit: RES_COUNT });
    } else {
      aggregationQuery.push({ $skip: PAGINATED_RES_COUNT * (pageNumber - 1) });
      aggregationQuery.push({ $limit: PAGINATED_RES_COUNT });
    }
    const cursor = this.documents.aggregate(aggregationQuery);
    return await cursor.toArray();
  }

  async fetchFacets(query: Query) {
    const metaAggregationQuery = query.getMetaQuery(this.convertedTaxonomy);
    const cursor = this.documents.aggregate(metaAggregationQuery);
    try {
      const aggRes = await cursor.toArray();
      const res = formatFacetMetaResponse(aggRes[0] as FacetAggRes, this.convertedTaxonomy);
      return res;
    } catch (e) {
      log.error(`Error while fetching facets: ${JSON.stringify(e)}`);
      throw e;
    }
  }

  async load(taxonomy: Taxonomy, manifestSource?: string, refreshManifests = true): Promise<RefreshInfo | undefined> {
    this.taxonomy = taxonomy;
    this.convertedTaxonomy = convertTaxonomyResponse(taxonomy);

    if (!refreshManifests) {
      return;
    }

    log.info('Starting fetch');
    if (this.currentlyIndexing) {
      throw new Error('already-indexing');
    }
    this.currentlyIndexing = true;

    if (manifestSource) {
      this.manifestSource = manifestSource;
    } else {
      manifestSource = this.manifestSource;
    }

    let result: RefreshInfo;
    try {
      const manifests = await getManifests(manifestSource);
      log.info(`Finished fetch: ${manifests.length} entries`);
      this.manifests = manifests;
      result = await this.sync(manifests);
    } catch (err) {
      throw err;
    } finally {
      this.currentlyIndexing = false;
    }

    return result;
  }

  async createRecommendedIndexes(): Promise<void> {
    log.info('Creating indexes');
    await this.documents.createIndexes([
      { key: { searchProperty: 1, manifestRevisionId: 1 } },
      { key: { searchProperty: 1, slug: 1 } },
    ]);
  }

  private async sync(manifests: Manifest[]): Promise<RefreshInfo> {
    // Syncing the database has a few discrete stages, some of which are helper functions:
    // 1) Fetch all manifests from S3
    // 1.5) Split manifest documents into searchable and unsearchable groupings
    // 2) Upsert all document groupings to respective collections
    // 2.5) Remove documents that should not be part of each manifest from respective collections
    // 3) Remove any documents attached to manifests that we don't know about from respective collections

    const session = this.client.startSession();
    const transactionOptions: TransactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' },
    };

    const startTime = process.hrtime.bigint();
    const status: RefreshInfo = {
      deleted: 0,
      updated: [],
      skipped: [],
      errors: [],
      dateStarted: new Date(),
      dateFinished: null,
      elapsedMS: null,
    };

    try {
      for (const manifest of manifests) {
        log.info(`Starting transaction: ${manifest.searchProperty}`);
        assert.strictEqual(typeof manifest.searchProperty, 'string');
        assert.ok(manifest.searchProperty);
        assert.strictEqual(typeof manifest.manifestRevisionId, 'string');
        assert.ok(manifest.manifestRevisionId);

        await session.withTransaction(async () => {
          const upserts = composeUpserts(manifest, manifest.manifest.documents);

          // Upsert documents
          if (upserts.length > 0) {
            const bulkWriteStatus = await this.documents.bulkWrite(upserts, { session, ordered: false });
            if (bulkWriteStatus.upsertedCount) status.updated.push(`${manifest.searchProperty} - indexable`);
          }
        }, transactionOptions);

        await deleteStaleDocuments(this.documents, manifest, session, status);
        await deleteStaleDocuments(this.unindexable, manifest, session, status);
      }

      await deleteStaleProperties(this.documents, manifests, session, status);
      await deleteStaleProperties(this.unindexable, manifests, session, status);

      this.lastRefresh = status;
    } catch (err) {
      log.error(err);
      status.errors.push(err);
    } finally {
      await session.endSession();
      log.info('Done!');
    }

    status.dateFinished = new Date();
    status.elapsedMS = Number(process.hrtime.bigint() - startTime) / 1000000;
    return status;
  }
}

// sync() helpers //
const deleteStaleDocuments = async (
  collection: Collection<DatabaseDocument>,
  manifest: Manifest,
  session: ClientSession,
  status: RefreshInfo
) => {
  log.debug(`Removing old documents for ${manifest.searchProperty}`);
  const deleteResult = await collection.deleteMany(
    {
      searchProperty: manifest.searchProperty,
      manifestRevisionId: { $ne: manifest.manifestRevisionId },
    },
    { session }
  );
  status.deleted += deleteResult.deletedCount === undefined ? 0 : deleteResult.deletedCount;
  log.debug(`Removed ${deleteResult.deletedCount} entries from ${collection.collectionName}`);
};

const deleteStaleProperties = async (
  collection: Collection<DatabaseDocument>,
  manifests: Manifest[],
  session: ClientSession,
  status: RefreshInfo
) => {
  log.debug('Deleting old properties');
  const deleteResult = await collection.deleteMany(
    {
      searchProperty: {
        $nin: manifests.map((manifest) => manifest.searchProperty),
      },
    },
    { session, writeConcern: { w: 'majority' } }
  );
  status.deleted += deleteResult.deletedCount === undefined ? 0 : deleteResult.deletedCount;
};

const composeUpserts = (manifest: Manifest, documents: Document[]): AnyBulkWriteOperation<DatabaseDocument>[] => {
  return documents.map((document) => {
    assert.strictEqual(typeof document.slug, 'string');
    // DOP-3545 and DOP-3585
    // slug is possible to be empty string ''
    assert.ok(document.slug || document.slug === '');

    const facets: Record<string, string | string[]> = {};

    // <-------- BEGIN TESTING PRE TAXONOMY -------->
    // testing genres and target platform as part of faceted search
    // TODO: update and revise after taxonomy v1 is finalized
    if (document.slug.includes('reference')) {
      facets['genres'] = ['reference'];
    } else if (document.slug.includes('tutorial')) {
      facets['genres'] = ['tutorial'];
    }

    // target_platform and target_platform->atlas<-versions acquired from manifest.searchProperty
    const parts = manifest.searchProperty.split('-');
    const target = parts.slice(0, parts.length - 1).join('-');
    const version = parts.slice(parts.length - 1).join('');
    facets['target_platforms'] = [target];
    facets[`target_platforms>${target}>versions`] = [version];

    // test driver hierarchy
    if (target === 'drivers') {
      // get sub_platform
      const sub_platform = document.slug.split(/[\/ | \-]/)[0];
      if (['index.html', 'community', 'specs', 'reactive', 'driver'].indexOf(sub_platform) === -1) {
        facets[`target_platforms>drivers>sub_platforms`] = [sub_platform];
      }
    }

    // <-------- END TESTING PRE TAXONOMY -------->

    const newDocument: DatabaseDocument = {
      ...document,
      url: joinUrl(manifest.manifest.url, document.slug),
      manifestRevisionId: manifest.manifestRevisionId,
      searchProperty: [manifest.searchProperty],
      includeInGlobalSearch: manifest.manifest.includeInGlobalSearch,
      facets: facets,
    };

    return {
      updateOne: {
        filter: { searchProperty: newDocument.searchProperty, slug: newDocument.slug },
        update: { $set: newDocument },
        upsert: true,
      },
    };
  });
};
