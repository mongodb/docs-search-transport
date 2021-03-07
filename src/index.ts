#!/usr/bin/env node
'use strict'

import { MongoClient, Collection, TransactionOptions, BulkWriteOperation, Db } from "mongodb"
import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import {parse as parseUrl, UrlWithParsedQuery} from 'url'
import util from 'util'

// @ts-ignore
import dive from 'dive'
// @ts-ignore
import Logger from 'basic-logger'

import S3 from 'aws-sdk/clients/s3'
import {Query} from "./Query"

process.title = 'search-transport'

const MAXIMUM_QUERY_LENGTH = 100

const STANDARD_HEADERS = {
    'X-Content-Type-Options': 'nosniff'
}

const log = new Logger({
    showTimestamp: true,
})

interface RefreshInfo {
    deleted: number
    updated: string[]
    skipped: string[]
    errors: Error[]
    dateStarted: Date
    dateFinished: Date | null
    elapsedMS: number | null
}

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

interface DatabaseDocument extends Document {
    manifestRevisionId: string
    searchProperty: string
    includeInGlobalSearch: boolean
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

/**
 * If the request method does not match the method parameter, return false
 * and write a 405 status code. Otherwise return true.
 */
function checkMethod(req: http.IncomingMessage, res: http.ServerResponse, method: string): boolean {
    if (req.method !== method) {
        res.writeHead(405, {})
        res.end('')
        return false
    }

    return true
}

class Index {
    currentlyIndexing?: boolean
    manifestSource: string
    manifests: Manifest[]
    errors: Error[]
    lastSyncDate: Date | null

    constructor(manifestSource: string) {
        this.manifestSource = manifestSource
        this.manifests = []
        this.errors = []

        this.lastSyncDate = null
    }

    getStatus() {
        return {
            manifests: this.manifests,
            lastSync: {
                errors: this.errors,
                finished: this.lastSyncDate ? this.lastSyncDate.toISOString() : null
            }
        }
    }

    async getManifestsFromS3(bucketName: string, prefix: string): Promise<Manifest[]> {
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
                continue
            }

            assert.ok(bucketEntry.Key)

            const matches = bucketEntry.Key.match(/([^/]+).json$/)
            if (matches === null) {
                this.errors.push(new Error(`Got weird filename in manifest listing: "${bucketEntry.Key}"`))
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

    getManifestsFromDirectory(prefix: string): Promise<Manifest[]> {
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

    async getManifests() {
        const parsedSource = this.manifestSource.match(/((?:bucket)|(?:dir)):(.+)/)
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
            manifests = await this.getManifestsFromS3(bucketName, prefix)
        } else if (parsedSource[1] === 'dir') {
            manifests = await this.getManifestsFromDirectory(parsedSource[2])
        } else {
            throw new Error('Unknown manifest source protocol')
        }

        return manifests
    }

    async load() {
        if (this.currentlyIndexing) {
            throw new Error('already-indexing')
        }
        this.currentlyIndexing = true

        try {
            this.manifests = await this.getManifests()
        } catch (err) {
            throw err
        } finally {
            this.currentlyIndexing = false
        }

        this.errors = []
    }
}

class Marian {
    index: Index
    client: MongoClient
    db: Db
    collection: Collection

    constructor(bucket: string, client: MongoClient) {
        this.index = new Index(bucket)
        this.client = client

        this.db = client.db('search')
        this.collection = this.db.collection('documents')

        // Fire-and-forget loading
        this.refresh().then(result => {
            log.info(JSON.stringify(result))
        }).catch((err) => {
            log.error(err)
        })
    }

    start(port: number) {
        const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
            try {
                await this.handle(req, res)
            } catch(err) {
                log.error(err)
                res.writeHead(500, {})
                res.end('')
            }
        })

        server.listen(port, () => {
            log.info(`Listening on port ${port}`)
        })
    }

    handle(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url
        if (!url) {
            assert.fail("Assertion: Missing url")
        }
        const parsedUrl = parseUrl(url, true)

        const pathname = (parsedUrl.pathname || "").replace(/\/+$/, '')
        assert.ok(pathname)

        if (pathname === '/search') {
            if (checkMethod(req, res, 'GET')) {
                this.handleSearch(parsedUrl, req, res)
            }
        } else if (pathname === '/refresh') {
            if (checkMethod(req, res, 'POST')) {
                this.handleRefresh(req, res)
            }
        } else if (pathname === '/status') {
            if (checkMethod(req, res, 'GET')) {
                this.handleStatus(req, res)
            }
        } else {
            res.writeHead(400, {})
            res.end('')
        }
    }

    async refresh(): Promise<RefreshInfo> {
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
            log.info("Starting fetch")
            await this.index.load()
            log.info(`Finished fetch: ${this.index.manifests.length} entries`)

            for (const manifest of this.index.manifests) {
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

                    await this.collection.bulkWrite(operations, {session, ordered: false})
                }, transactionOptions)

                log.info(`Removing old documents for ${manifest.searchProperty}`)
                const deleteResult = await this.collection.deleteMany({
                    searchProperty: manifest.searchProperty,
                    manifestRevisionId: {"$ne": manifest.manifestRevisionId}
                }, {session})
                status.deleted += (deleteResult.deletedCount === undefined) ? 0 : deleteResult.deletedCount
                log.debug(`Removed ${deleteResult.deletedCount} documents`)

                status.updated.push(manifest.searchProperty)
            }

            log.info("Deleting old properties")
            const deleteResult = await this.collection.deleteMany(
                {
                    searchProperty: {
                        $nin: this.index.manifests.map(manifest => manifest.searchProperty)
                    }
                },
                {session, w: "majority"})
            status.deleted += (deleteResult.deletedCount === undefined) ? 0 : deleteResult.deletedCount
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

    async handleSearch(parsedUrl: UrlWithParsedQuery, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const start = process.hrtime.bigint()
        const headers = {
            'Content-Type': 'application/json',
            'Vary': 'Accept-Encoding',
            'Cache-Control': 'public,max-age=120,must-revalidate',
            'Access-Control-Allow-Origin': '*',
        }
        Object.assign(headers, STANDARD_HEADERS)

        const rawQuery = (parsedUrl.query.q || "").toString()
        if (!rawQuery) {
            res.writeHead(400, headers)
            res.end('[]')
            return
        }

        if (rawQuery.length > MAXIMUM_QUERY_LENGTH) {
            res.writeHead(400, headers)
            res.end('[]')
            return
        }

        const query = new Query(rawQuery)

        const aggregationQuery = query.getAggregationQuery((parsedUrl.query.searchProperty || "").toString())
        log.info(JSON.stringify(aggregationQuery, null, 4))
        aggregationQuery.push({$limit: 50})
        aggregationQuery.push({$project: {
            "_id": 0,
            "title": 1,
            "preview": 1
        }})
        const cursor = await this.collection.aggregate(aggregationQuery)

        const results = await cursor.toArray()
        let responseBody = JSON.stringify(results)
        res.writeHead(200, headers)
        res.end(responseBody)

        const end = process.hrtime.bigint()
        log.info(Number(end - start) / 1000000)
    }

    async handleRefresh(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const headers: Record<string, string> = {
            'Vary': 'Accept-Encoding'
        }
        Object.assign(headers, STANDARD_HEADERS)

        try {
            log.info(JSON.stringify(await this.refresh()))
        } catch(err) {
            log.error(err)
            headers['Content-Type'] = 'application/json'
            const body = JSON.stringify({'errors': [err]})

            if (err.message === 'already-indexing') {
                res.writeHead(503, headers)
            } else {
                res.writeHead(500, headers)
            }
            res.end(body)
            return
        }

        if (this.index.errors.length > 0) {
            headers['Content-Type'] = 'application/json'
            const body = JSON.stringify({'errors': this.index.errors})
            res.writeHead(200, headers)
            res.end(body)
            return
        }

        res.writeHead(200, headers)
        res.end('')
    }

    async handleStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const headers = {
            'Content-Type': 'application/json',
            'Vary': 'Accept-Encoding',
            'Pragma': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        }
        Object.assign(headers, STANDARD_HEADERS)

        res.writeHead(200, headers)
        res.end()
    }
}

async function main() {
    Logger.setLevel('info', true)

    if (process.argv.length != 4) {
        console.error("Usage: search-transport <manifest-uri> <mongodb-uri>")
        process.exit(1)
    }

    const client = new MongoClient(process.argv[3], {useUnifiedTopology: true})
    client.connect((err) => {
        assert.ok(!err)
        log.info('Connected correctly to MongoDB')

        const server = new Marian(process.argv[2], client)
        server.start(8080)
    })
}

try {
    main()
} catch (err) {
    console.error(err)
}
