#!/usr/bin/env node
'use strict'

import { MongoClient } from "mongodb"
import assert from 'assert'
import http from 'http'
import {parse as parseUrl, UrlWithParsedQuery} from 'url'

// @ts-ignore
import Logger from 'basic-logger'

import {Query} from "./Query"
import {SearchIndex, RefreshInfo} from "./SearchIndex"

process.title = 'search-transport'

const MAXIMUM_QUERY_LENGTH = 100

const STANDARD_HEADERS = {
    'X-Content-Type-Options': 'nosniff'
}

const log = new Logger({
    showTimestamp: true,
})

interface StatusResponse {
    manifests: string[]
    lastSync?: RefreshInfo | null
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

class Marian {
    index: SearchIndex

    constructor(index: SearchIndex) {
        this.index = index

        // Fire-and-forget loading
        this.index.isEmpty().then((empty) => {
            if (!empty) {
                return
            }

            return this.index.load()
        }).then((result) => {
            if (result) {
                log.info(JSON.stringify(result))
            }
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
                this.handleStatus(parsedUrl, req, res)
            }
        } else {
            res.writeHead(400, {})
            res.end('')
        }
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

        let searchProperty = parsedUrl.query.searchProperty || null
        if (typeof searchProperty === "string") {
            searchProperty = [searchProperty]
        }
        const results = await this.index.search(query, searchProperty)
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
            await this.index.load()
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

        if (this.index.lastRefresh && this.index.lastRefresh.errors.length > 0) {
            headers['Content-Type'] = 'application/json'
            const body = JSON.stringify({'errors': this.index.lastRefresh.errors})
            res.writeHead(200, headers)
            res.end(body)
            return
        }

        res.writeHead(200, headers)
        res.end('')
    }

    async handleStatus(parsedUrl: UrlWithParsedQuery, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const headers = {
            'Content-Type': 'application/json',
            'Vary': 'Accept-Encoding',
            'Pragma': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        }
        Object.assign(headers, STANDARD_HEADERS)

        const response: StatusResponse = {
            "manifests": this.index.manifests.map(manifest => manifest.searchProperty),
        }

        if (parsedUrl.query.verbose) {
            response.lastSync = this.index.lastRefresh
        }

        res.writeHead(200, headers)
        res.end(JSON.stringify(response))
    }
}

async function main() {
    Logger.setLevel('info', true)

    if (process.argv.length != 4 && process.argv.length != 5) {
        console.error("Usage: search-transport <manifest-uri> <mongodb-uri> [--create-indexes]")
        process.exit(1)
    }

    const client = await MongoClient.connect(process.argv[3], {useUnifiedTopology: true}, )
    const searchIndex = new SearchIndex(process.argv[2], client)
    if (process.argv.indexOf("--create-indexes") > -1) {
        await searchIndex.createRecommendedIndexes()
    }
    const server = new Marian(searchIndex)
    server.start(8080)
}

try {
    main()
} catch (err) {
    console.error(err)
}
