'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.SearchIndex = exports.joinUrl = void 0;
const assert_1 = __importDefault(require('assert'));
const crypto_1 = __importDefault(require('crypto'));
const fs_1 = __importDefault(require('fs'));
const util_1 = __importDefault(require('util'));
const s3_1 = __importDefault(require('aws-sdk/clients/s3'));
// @ts-ignore
const dive_1 = __importDefault(require('dive'));
// @ts-ignore
const basic_logger_1 = __importDefault(require('basic-logger'));
const log = new basic_logger_1.default({
  showTimestamp: true,
});
function joinUrl(base, path) {
  return base.replace(/\/*$/, '/') + path.replace(/^\/*/, '');
}
exports.joinUrl = joinUrl;
function generateHash(data) {
  const hash = crypto_1.default.createHash('sha256');
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
async function getManifestsFromS3(bucketName, prefix) {
  const s3 = new s3_1.default({ apiVersion: '2006-03-01' });
  const result = await util_1.default.promisify(
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
    assert_1.default.ok(bucketEntry.Key);
    const matches = bucketEntry.Key.match(/([^/]+).json$/);
    if (matches === null) {
      log.error(new Error(`Got weird filename in manifest listing: "${bucketEntry.Key}"`));
      continue;
    }
    const searchProperty = matches[1];
    const data = await util_1.default.promisify(
      s3.makeUnauthenticatedRequest.bind(s3, 'getObject', {
        Bucket: bucketName,
        Key: bucketEntry.Key,
      })
    )();
    assert_1.default.ok(data.Body);
    assert_1.default.ok(data.LastModified);
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
function getManifestsFromDirectory(prefix) {
  return new Promise((resolve, reject) => {
    const manifests = [];
    dive_1.default(
      prefix,
      async (err, path, stats) => {
        if (err) {
          reject(err);
        }
        const matches = path.match(/([^/]+).json$/);
        if (!matches) {
          return;
        }
        const searchProperty = matches[1];
        const data = fs_1.default.readFileSync(path, { encoding: 'utf-8' });
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
async function getManifests(manifestSource) {
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
class SearchIndex {
  constructor(manifestSource, client, databaseName) {
    this.currentlyIndexing = false;
    this.manifestSource = manifestSource;
    this.manifests = null;
    this.client = client;
    this.db = client.db(databaseName);
    this.documents = this.db.collection('documents');
    this.lastRefresh = null;
  }
  async search(query, searchProperty) {
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
    const cursor = await this.documents.aggregate(aggregationQuery);
    return await cursor.toArray();
  }
  async load(manifestSource) {
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
    let result;
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
  async createRecommendedIndexes() {
    log.info('Creating indexes');
    await this.documents.createIndexes([
      { key: { searchProperty: 1, manifestRevisionId: 1 } },
      { key: { searchProperty: 1, slug: 1 } },
    ]);
  }
  async sync(manifests) {
    // Syncing the database has a few discrete stages:
    // 1) Fetch all manifests from S3
    // 2) Upsert all documents
    // 2.5) Remove documents that should not be part of each manifest
    // 3) Remove any documents attached to manifests that we don't know about
    const session = this.client.startSession();
    const transactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' },
    };
    const startTime = process.hrtime.bigint();
    const status = {
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
        assert_1.default.strictEqual(typeof manifest.searchProperty, 'string');
        assert_1.default.ok(manifest.searchProperty);
        assert_1.default.strictEqual(typeof manifest.manifestRevisionId, 'string');
        assert_1.default.ok(manifest.manifestRevisionId);
        await session.withTransaction(async () => {
          const operations = manifest.manifest.documents.map((document) => {
            assert_1.default.strictEqual(typeof document.slug, 'string');
            assert_1.default.ok(document.slug);
            const newDocument = {
              ...document,
              url: joinUrl(manifest.manifest.url, document.slug),
              manifestRevisionId: manifest.manifestRevisionId,
              searchProperty: [manifest.searchProperty, ...(manifest.manifest.aliases || [])],
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
          // If there are any documents in the manifest, upsert them
          if (operations.length > 0) {
            const bulkWriteStatus = await this.documents.bulkWrite(operations, { session, ordered: false });
            if (bulkWriteStatus.upsertedCount) {
              status.updated.push(manifest.searchProperty);
            }
          }
        }, transactionOptions);
        log.debug(`Removing old documents for ${manifest.searchProperty}`);
        const deleteResult = await this.documents.deleteMany(
          {
            searchProperty: manifest.searchProperty,
            manifestRevisionId: { $ne: manifest.manifestRevisionId },
          },
          { session }
        );
        status.deleted += deleteResult.deletedCount === undefined ? 0 : deleteResult.deletedCount;
        log.debug(`Removed ${deleteResult.deletedCount} documents`);
      }
      log.debug('Deleting old properties');
      const deleteResult = await this.documents.deleteMany(
        {
          searchProperty: {
            $nin: manifests.map((manifest) => manifest.searchProperty),
          },
        },
        { session, w: 'majority' }
      );
      status.deleted += deleteResult.deletedCount === undefined ? 0 : deleteResult.deletedCount;
      this.lastRefresh = status;
    } catch (err) {
      log.error(err);
      status.errors.push(err);
    } finally {
      session.endSession();
      log.info('Done!');
    }
    status.dateFinished = new Date();
    status.elapsedMS = Number(process.hrtime.bigint() - startTime) / 1000000;
    return status;
  }
}
exports.SearchIndex = SearchIndex;
