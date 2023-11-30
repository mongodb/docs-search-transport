import assert from 'assert';
// @ts-ignore
import Logger from 'basic-logger';
import { MongoClient, Collection, TransactionOptions, AnyBulkWriteOperation, Db, ClientSession, Filter } from 'mongodb';

import {
  compareFacets,
  convertTaxonomyToResponseFormat,
  convertTaxonomyToTrie,
  formatFacetMetaResponse,
  getManifests,
  joinUrl,
  sortFacetsObject,
} from './util';
import { Query } from '../Query';
import {
  Document,
  Manifest,
  DatabaseDocument,
  RefreshInfo,
  Taxonomy,
  FacetOption,
  FacetAggRes,
  TrieFacet,
  AmbiguousFacet,
} from './types';

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
  trieFacets: TrieFacet;
  responseFacets: FacetOption[];

  constructor(manifestSource: string, client: MongoClient, databaseName: string) {
    this.currentlyIndexing = false;
    this.manifestSource = manifestSource;
    this.manifests = null;

    this.client = client;
    this.db = client.db(databaseName);
    this.documents = this.db.collection<DatabaseDocument>('documents');
    this.unindexable = this.db.collection<DatabaseDocument>('unindexable');
    this.lastRefresh = null;
    this.trieFacets = {
      name: '',
    };
    this.responseFacets = [];
  }

  async search(query: Query, searchProperty: string[] | null, filters: Filter<Document>[], pageNumber?: number) {
    const aggregationQuery = query.getAggregationQuery(searchProperty, filters, pageNumber);
    const cursor = this.documents.aggregate(aggregationQuery);
    return cursor.toArray();
  }

  async fetchFacets(query: Query, searchProperty: string[] | null, filters: Filter<Document>[]) {
    const metaAggregationQuery = query.getMetaQuery(searchProperty, this.responseFacets, filters);
    const cursor = this.documents.aggregate(metaAggregationQuery);
    try {
      // TODO: re-implement
      const aggRes = await cursor.toArray();
      return formatFacetMetaResponse(aggRes[0] as FacetAggRes, this.trieFacets);
    } catch (e) {
      log.error(`Error while fetching facets for query ${query}, with search property ${searchProperty}, and filters ${filters} ${JSON.stringify(e)}`);
      log.trace();
      throw e;
    }
  }

  async load(taxonomy: Taxonomy, manifestSource?: string, refreshManifests = true): Promise<RefreshInfo | undefined> {
    this.responseFacets = convertTaxonomyToResponseFormat(taxonomy);
    this.trieFacets = convertTaxonomyToTrie(taxonomy);
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
          const upserts = composeUpserts(manifest, manifest.manifest.documents, this.trieFacets);

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
      status.errors.push(err as Error);
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

const composeUpserts = (
  manifest: Manifest,
  documents: Document[],
  trieFacets: TrieFacet
): AnyBulkWriteOperation<DatabaseDocument>[] => {
  return documents.map((document) => {
    assert.strictEqual(typeof document.slug, 'string');
    // DOP-3545 and DOP-3585
    // slug is possible to be empty string ''
    assert.ok(document.slug || document.slug === '');

    // DOP-3962
    // We need a slug field with no special chars for keyword search
    // and exact match, e.g. no "( ) { } [ ] ^ “ ~ * ? : \ /" present
    document.strippedSlug = document.slug.replaceAll('/', '');

    if (document.facets) {
      document.facets = sortFacetsObject(document.facets, trieFacets);
    }

    const newDocument: DatabaseDocument = {
      ...document,
      url: joinUrl(manifest.manifest.url, document.slug),
      manifestRevisionId: manifest.manifestRevisionId,
      searchProperty: [manifest.searchProperty],
      includeInGlobalSearch: manifest.manifest.includeInGlobalSearch,
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
