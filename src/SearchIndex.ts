import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import util from 'util'
import S3 from 'aws-sdk/clients/s3'
import { MongoClient, Collection, TransactionOptions, BulkWriteOperation, Db } from "mongodb"
// @ts-ignore
import dive from 'dive'
// @ts-ignore
import Logger from 'basic-logger'
import { Query } from './Query'

const log = new Logger({
    showTimestamp: true,
})

interface Document {
    slug: string
    title: string
    headings: string[]
    text: string
    preview: string
    tags: string
    links: string[]
}

interface ManifestData {
    documents: Document[]
    includeInGlobalSearch: boolean
    url: string
    aliases: string[]
}

interface Manifest {
    manifest: ManifestData
    lastModified: Date
    manifestRevisionId: string
    searchProperty: string
}

export interface DatabaseDocument extends Document {
    manifestRevisionId: string
    searchProperty: string
    includeInGlobalSearch: boolean
}

export interface RefreshInfo {
    deleted: number
    updated: string[]
    skipped: string[]
    errors: Error[]
    dateStarted: Date
    dateFinished: Date | null
    elapsedMS: number | null
}

function generateHash(data: string): Promise<string> {
    const hash = crypto.createHash('sha256')

    return new Promise((resolve, reject) => {
        hash.on('readable', () => {
            const data = hash.read();
            if (data) {
                resolve(data.toString('hex'))
            }
        });

        hash.write(data);
        hash.end();
    })
}

async function getManifestsFromS3(bucketName: string, prefix: string): Promise<Manifest[]> {
    const s3 = new S3({apiVersion: '2006-03-01'})
    const result: S3.Types.ListObjectsV2Output = await util.promisify(s3.makeUnauthenticatedRequest.bind(s3, 'listObjectsV2', {
        Bucket: bucketName,
        Prefix: prefix
    }))()

    if (result.IsTruncated) {
        // This would indicate something awry, since we shouldn't
        // ever have more than 1000 properties. And if we ever did,
        // everything would need to be rearchitected.
        throw new Error('Got truncated response from S3')
    }

    const manifests = []
    for (const bucketEntry of (result.Contents || [])) {
        if (bucketEntry.Size === 0) {
            log.error(new Error(`Got empty file: "${bucketEntry.Key}"`))
            continue
        }

        assert.ok(bucketEntry.Key)

        const matches = bucketEntry.Key.match(/([^/]+).json$/)
        if (matches === null) {
            log.error(new Error(`Got weird filename in manifest listing: "${bucketEntry.Key}"`))
            continue
        }

        const searchProperty = matches[1]
        const data: S3.Types.GetObjectOutput = await util.promisify(s3.makeUnauthenticatedRequest.bind(s3, 'getObject', {
            Bucket: bucketName,
            Key: bucketEntry.Key
        }))()

        assert.ok(data.Body)
        assert.ok(data.LastModified)

        const body = data.Body.toString('utf-8')
        const hash = await generateHash(body)
        const parsed = JSON.parse(body)
        manifests.push({
            manifest: parsed,
            lastModified: data.LastModified,
            manifestRevisionId: hash,
            searchProperty: searchProperty
        })
    }

    return manifests
}

function getManifestsFromDirectory(prefix: string): Promise<Manifest[]> {
    return new Promise((resolve, reject) => {
        const manifests: Manifest[] = []

        dive(prefix, async (err: Error | null, path: string, stats: fs.Stats) => {
            if (err) { reject(err) }
            const matches = path.match(/([^/]+).json$/)
            if (!matches) { return }
            const searchProperty = matches[1]
            const data = fs.readFileSync(path, {encoding: 'utf-8'})
            const parsed = JSON.parse(data)
            const hash = await generateHash(data)

            manifests.push({
                manifest: parsed,
                lastModified: stats.mtime,
                manifestRevisionId: hash,
                searchProperty: searchProperty
            })
        }, () => {
            resolve(manifests)
        })})
}

/// Fetch manifests from a given path. It can (for historic cruft reasons)
/// take one of two formats:
/// dir:<path> to load manifests from a local directory.
/// bucket:<bucketName>/<prefix> to load manifests from an S3 location.
async function getManifests(manifestSource: string): Promise<Manifest[]> {
    const parsedSource = manifestSource.match(/((?:bucket)|(?:dir)):(.+)/)
    if (!parsedSource) {
        throw new Error('Bad manifest source')
    }

    let manifests
    if (parsedSource[1] === 'bucket') {
        const parts = parsedSource[2].split('/', 2)
        const bucketName = parts[0].trim()
        const prefix = parts[1].trim()
        if (!bucketName.length || !prefix.length) {
            throw new Error('Bad bucket manifest source')
        }
        manifests = await getManifestsFromS3(bucketName, prefix)
    } else if (parsedSource[1] === 'dir') {
        manifests = await getManifestsFromDirectory(parsedSource[2])
    } else {
        throw new Error('Unknown manifest source protocol')
    }

    return manifests
}

export class SearchIndex {
    currentlyIndexing: boolean
    manifestSource: string
    manifests: Manifest[]

    client: MongoClient
    db: Db
    lastRefresh: RefreshInfo | null
    documents: Collection

    constructor(manifestSource: string, client: MongoClient, databaseName: string = "search") {
        this.currentlyIndexing = false
        this.manifestSource = manifestSource
        this.manifests = []

        this.client = client
        this.db = client.db(databaseName)
        this.documents = this.db.collection('documents')
        this.lastRefresh = null
    }

    async search(query: Query, searchProperty: string | null) {
        const aggregationQuery = query.getAggregationQuery(searchProperty)
        log.info(JSON.stringify(aggregationQuery, null, 4))
        aggregationQuery.push({$limit: 50})
        aggregationQuery.push({$project: {
            "_id": 0,
            "title": 1,
            "preview": 1
        }})
        const cursor = await this.documents.aggregate(aggregationQuery)

        return await cursor.toArray()
    }

    async load(manifestSource?: string): Promise<RefreshInfo> {
        log.info("Starting fetch")
        if (this.currentlyIndexing) {
            throw new Error('already-indexing')
        }
        this.currentlyIndexing = true

        if (manifestSource) {
            this.manifestSource = manifestSource
        } else {
            manifestSource = this.manifestSource
        }

        let result: RefreshInfo
        try {
            const manifests = await getManifests(manifestSource)
            log.info(`Finished fetch: ${manifests.length} entries`)
            this.manifests = manifests
            result = await this.sync(manifests)
        } catch (err) {
            throw err
        } finally {
            this.currentlyIndexing = false
        }

        return result
    }

    private async sync(manifests: Manifest[]): Promise<RefreshInfo> {
        // Syncing the database has a few discrete stages:
        // 1) Fetch all manifests from S3
        // 2) Upsert all documents
        // 2.5) Remove documents that should not be part of each manifest
        // 3) Remove any documents attached to manifests that we don't know about

        const session = this.client.startSession()
        const transactionOptions: TransactionOptions = {
            readPreference: 'primary',
            readConcern: { level: 'local' },
            writeConcern: { w: 'majority' }
        };

        const startTime = process.hrtime.bigint()
        const status: RefreshInfo = {
            deleted: 0,
            updated: [],
            skipped: [],
            errors: [],
            dateStarted: new Date(),
            dateFinished: null,
            elapsedMS: null
        }

        try {
            for (const manifest of manifests) {
                log.info(`Starting transaction: ${manifest.searchProperty}`)
                assert.strictEqual(typeof manifest.searchProperty, "string")
                assert.ok(manifest.searchProperty)
                assert.strictEqual(typeof manifest.manifestRevisionId, "string")
                assert.ok(manifest.manifestRevisionId)

                await session.withTransaction(async () => {
                    const operations: BulkWriteOperation<DatabaseDocument>[] = manifest.manifest.documents.map((document) => {
                        assert.strictEqual(typeof document.slug, "string")
                        assert.ok(document.slug)

                        const newDocument: DatabaseDocument = {
                            ...document,
                            manifestRevisionId: manifest.manifestRevisionId,
                            searchProperty: manifest.searchProperty,
                            includeInGlobalSearch: manifest.manifest.includeInGlobalSearch,
                        }

                        return {
                            updateOne: {
                                filter: {searchProperty: newDocument.searchProperty, slug: newDocument.slug},
                                update: {$set: newDocument},
                                upsert: true
                            }
                        }
                    })

                    const bulkWriteStatus = await this.documents.bulkWrite(operations, {session, ordered: false})
                    if (bulkWriteStatus.upsertedCount) {
                        status.updated.push(manifest.searchProperty)
                    }
                }, transactionOptions)

                log.debug(`Removing old documents for ${manifest.searchProperty}`)
                const deleteResult = await this.documents.deleteMany({
                    searchProperty: manifest.searchProperty,
                    manifestRevisionId: {"$ne": manifest.manifestRevisionId}
                }, {session})
                status.deleted += (deleteResult.deletedCount === undefined) ? 0 : deleteResult.deletedCount
                log.debug(`Removed ${deleteResult.deletedCount} documents`)
            }

            log.debug("Deleting old properties")
            const deleteResult = await this.documents.deleteMany(
                {
                    searchProperty: {
                        $nin: manifests.map(manifest => manifest.searchProperty)
                    }
                },
                {session, w: "majority"})
            status.deleted += (deleteResult.deletedCount === undefined) ? 0 : deleteResult.deletedCount

            this.lastRefresh = status
        } catch(err) {
            log.error(err)
            status.errors.push(err)
        } finally {
            session.endSession()
            log.info("Done!")
        }

        status.dateFinished = new Date()
        status.elapsedMS = Number(process.hrtime.bigint() - startTime) / 1000000
        return status
    }
}
