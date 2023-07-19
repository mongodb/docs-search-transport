import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import { Document as MongoDocument } from 'mongodb';
import util from 'util';
import S3 from 'aws-sdk/clients/s3';
import { MongoClient, Collection, TransactionOptions, AnyBulkWriteOperation, Db, ClientSession } from 'mongodb';
// @ts-ignore
import dive from 'dive';
// @ts-ignore
import Logger from 'basic-logger';
import { Query } from './Query';
import { convertTaxonomyResponse } from './util';

const log = new Logger({
  showTimestamp: true,
});

export interface Document {
  slug: string;
  title?: string;
  headings?: string[];
  text?: string; // legacy manifests have text instead of paragraphs
  paragraphs?: string; // legacy manifests will not have paragraphs
  code?: {}[]; // legacy manifests will not have code field
  preview?: string;
  tags: null | string[];
  facets?: {};
}

interface ManifestData {
  documents: Document[];
  includeInGlobalSearch: boolean;
  url: string;
}

interface Manifest {
  manifest: ManifestData;
  lastModified: Date;
  manifestRevisionId: string;
  searchProperty: string;
}

export interface DatabaseDocument extends Document {
  url: string;
  manifestRevisionId: string;
  searchProperty: string[];
  includeInGlobalSearch: boolean;
}

export interface RefreshInfo {
  deleted: number;
  updated: string[];
  skipped: string[];
  errors: Error[];
  dateStarted: Date;
  dateFinished: Date | null;
  elapsedMS: number | null;
}

export interface TaxonomyEntity {
  name: string;
  display_name?: string;
  [x: string]: TaxonomyEntity[] | string | undefined;
}
export type Taxonomy = Record<string, TaxonomyEntity[]>;

export type FacetDisplayNames = {
  name?: string;
  [key: string]: object | string | undefined;
};

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/*$/, '/') + path.replace(/^\/*/, '');
}

function generateHash(data: string): Promise<string> {
  const hash = crypto.createHash('sha256');

  return new Promise((resolve, reject) => {
    hash.on('readable', () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString('hex'));
      }
    });

    hash.write(data);
    hash.end();
  });
}

async function getManifestsFromS3(bucketName: string, prefix: string): Promise<Manifest[]> {
  const s3 = new S3({ apiVersion: '2006-03-01' });
  const result: S3.Types.ListObjectsV2Output = await util.promisify(
    s3.makeUnauthenticatedRequest.bind(s3, 'listObjectsV2', {
      Bucket: bucketName,
      Prefix: prefix.replace(/^\//, ''),
    })
  )();

  if (result.IsTruncated) {
    // This would indicate something awry, since we shouldn't
    // ever have more than 1000 properties. And if we ever did,
    // everything would need to be rearchitected.
    throw new Error('Got truncated response from S3');
  }

  const manifests = [];
  for (const bucketEntry of result.Contents || []) {
    if (bucketEntry.Size === 0) {
      log.error(new Error(`Got empty file: "${bucketEntry.Key}"`));
      continue;
    }

    assert.ok(bucketEntry.Key);

    const matches = bucketEntry.Key.match(/([^/]+).json$/);
    if (matches === null) {
      log.error(new Error(`Got weird filename in manifest listing: "${bucketEntry.Key}"`));
      continue;
    }

    const searchProperty = matches[1];
    const data: S3.Types.GetObjectOutput = await util.promisify(
      s3.makeUnauthenticatedRequest.bind(s3, 'getObject', {
        Bucket: bucketName,
        Key: bucketEntry.Key,
      })
    )();

    assert.ok(data.Body);
    assert.ok(data.LastModified);

    const body = data.Body.toString('utf-8');
    const hash = await generateHash(body);
    const parsed = JSON.parse(body);
    manifests.push({
      manifest: parsed,
      lastModified: data.LastModified,
      manifestRevisionId: hash,
      searchProperty: searchProperty,
    });
  }

  return manifests;
}

function getManifestsFromDirectory(prefix: string): Promise<Manifest[]> {
  return new Promise((resolve, reject) => {
    const manifests: Manifest[] = [];

    dive(
      prefix,
      async (err: Error | null, path: string, stats: fs.Stats) => {
        if (err) {
          reject(err);
        }
        const matches = path.match(/([^/]+).json$/);
        if (!matches) {
          return;
        }
        const searchProperty = matches[1];
        const data = fs.readFileSync(path, { encoding: 'utf-8' });
        const parsed = JSON.parse(data);
        const hash = await generateHash(data);

        manifests.push({
          manifest: parsed,
          lastModified: stats.mtime,
          manifestRevisionId: hash,
          searchProperty: searchProperty,
        });
      },
      () => {
        resolve(manifests);
      }
    );
  });
}

/// Fetch manifests from a given path. It can (for historic cruft reasons)
/// take one of two formats:
/// dir:<path> to load manifests from a local directory.
/// s3://<bucketName>/<prefix> to load manifests from an S3 location.
async function getManifests(manifestSource: string): Promise<Manifest[]> {
  const parsed = new URL(manifestSource);

  let manifests;
  if (parsed.protocol === 's3:') {
    const bucketName = parsed.host.trim();
    const prefix = parsed.pathname.trim();
    if (!bucketName.length || !prefix.length) {
      throw new Error('Bad bucket manifest source');
    }
    manifests = await getManifestsFromS3(bucketName, prefix);
  } else if (parsed.protocol === 'dir:') {
    manifests = await getManifestsFromDirectory(parsed.pathname);
  } else {
    throw new Error('Unknown manifest source protocol');
  }

  // We have a persistent problem with weird URLs. Remove excess leading slashes.
  for (const manifest of manifests) {
    const urlRoot = new URL(manifest.manifest.url);
    urlRoot.pathname = urlRoot.pathname.replace(/^\/+/, '');
    manifest.manifest.url = urlRoot.toString();
  }

  return manifests;
}

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

  async search(query: Query, searchProperty: string[] | null) {
    const aggregationQuery = query.getAggregationQuery(searchProperty);
    aggregationQuery.push({ $limit: 50 });
    aggregationQuery.push({
      $project: {
        _id: 0,
        title: 1,
        preview: 1,
        url: 1,
        searchProperty: 1,
      },
    });
    const cursor = this.documents.aggregate(aggregationQuery);
    return await cursor.toArray();
  }

  async factedSearch(query: Query, searchProperty: string[] | null, facetKeys: string[]): Promise<MongoDocument[]> {
    const aggregationQuery = query.getFacetedAggregationQuery(searchProperty, facetKeys, this.taxonomy);
    const cursor = this.documents.aggregate(aggregationQuery);
    return await cursor.toArray();
  }

  async load(taxonomy: Taxonomy, manifestSource?: string): Promise<RefreshInfo> {
    this.taxonomy = taxonomy;
    this.convertedTaxonomy = convertTaxonomyResponse(taxonomy);

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

    const facets: Record<string, object> = {};

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
    const targetPlatformFacet = {
      name: target,
      versions: [
        {
          name: version,
        },
      ],
    };
    facets['target_platforms'] = [targetPlatformFacet];

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
