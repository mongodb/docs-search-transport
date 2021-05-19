import { strictEqual, deepStrictEqual, ok } from "assert"
import { Query } from "../src/Query"
import { SearchIndex } from "../src/SearchIndex"
import { env } from "process"
import { MongoClient } from "mongodb"

const TEST_DATABASE = "search-test"

describe("Searching", function() {
    this.slow(200)

    const connectionString = env.ATLAS_URI
    if (!connectionString) {
        return
    }

    const client = new MongoClient(connectionString, { useUnifiedTopology: true })
    let index: SearchIndex

    before("Loading test data", async function() {
        await client.connect()
        index = new SearchIndex("dir:tests/search_test_data/", client, TEST_DATABASE)
        const result = await index.load()
        await index.createRecommendedIndexes()

        // I don't see a way to wait for indexing to complete, so... just sleep for some unscientific amount of time 🙃
        if (result.deleted || result.updated.length > 0) {
            this.timeout(8000)
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    })

    it("should return proper results for a normal query", async () => {
        const result = await index.search(new Query('"connect dialog" compass'), null)
        deepStrictEqual(result, [
            {'title':'Connect via Compass — MongoDB Atlas','preview':'The Connect dialog for a cluster provides the details to connect to a cluster via Compass.','url':'https://docs.atlas.mongodb.com/compass-connection/index.html'},
            {"title":"Connect to a Cluster — MongoDB Atlas","preview": "Atlas provides instructions on connecting to a cluster via the mongo shell, a MongoDB driver, or MongoDB Compass via the Atlas UI.","url": "https://docs.atlas.mongodb.com/connect-to-cluster/index.html"},
            {'title':'Connect via mongo Shell — MongoDB Atlas','preview':'The Connect dialog for a cluster provides the details to connect to a cluster via the mongo shell.','url':'https://docs.atlas.mongodb.com/mongo-shell-connection/index.html'},
            {'title':'Connect via Driver — MongoDB Atlas','preview':'The Connect dialog for a cluster provides the details to connect to a cluster with an application using a MongoDB driver.','url':'https://docs.atlas.mongodb.com/driver-connection/index.html'},
            {'title':'Load File with mongoimport — MongoDB Atlas','preview':'You can use mongoimport to import data from a JSON or a CSV file into MongoDB Atlas cluster.','url':'https://docs.atlas.mongodb.com/import/mongoimport/index.html'},
            {'title':'Migrate with mongomirror — MongoDB Atlas','preview':'mongomirror is a utility for migrating data from an existing MongoDB replica set to a MongoDB Atlas replica set. mongomirror does not require you to shut down your existing replica set or applications.','url':'https://docs.atlas.mongodb.com/import/mongomirror/index.html'},
            {'title':'MongoDB Atlas — MongoDB Atlas','preview':'MongoDB Atlas is a cloud service for running, monitoring, and maintaining MongoDB deployments, including the provisioning of dedicated servers for the MongoDB instances. In addition, Atlas provides the ability to introspect collections, query backups, and migrate data from existing MongoDB replica set into an Atlas cluster.','url':'https://docs.atlas.mongodb.com/index.html'},
            {"title":"Seed with mongorestore — MongoDB Atlas", "preview": "You can use mongodump and mongorestore to seed MongoDB Atlas cluster with data from an existing MongoDB standalone, replica set or a sharded cluster.","url": "https://docs.atlas.mongodb.com/import/mongorestore/index.html"}])
    })

    // Test variants of searchProperty
    it('should properly handle searchProperty', async () => {
        let result = await index.search(new Query('aggregation'), null)

        deepStrictEqual(result, [
            {"title":"Schema Configuration — MongoDB Connector for BI 2.2","preview":"Business intelligence tools connect to a data source and, given a fixed tabular schema, allow the user to visually explore their data. As MongoDB uses a flexible schema, these tools currently cannot use MongoDB as a native data source.","url":"https://docs.mongodb.com/bi-connector/current/schema-configuration/index.html"},
            {"title":"MongoDB Reference — MongoDB Atlas","preview":"For a comprehensive documentation of MongoDB, refer to the MongoDB Manual. The following sections in the manual provide some starting points for developing with MongoDB.","url":"https://docs.atlas.mongodb.com/mongodb-reference/index.html"},
            {"title":"Release Notes for MongoDB Connector for BI — MongoDB Connector for BI 2.2","preview":"Supports authenticating directly against MongoDB using the new C and JDBC authentication plugins. These plugins support SCRAM-SHA-1 and PLAIN mechanisms and remove the SSL requirement for authentication. The authentication plugins can be found on GitHub:","url":"https://docs.mongodb.com/bi-connector/current/release-notes/index.html"},
            {"title":"FAQ: The MongoDB Connector for BI — MongoDB Connector for BI 2.2","preview":"Changed in version 2.0: Prior to version 2.0, the MongoDB Connector for BI stored its own separate set of credentials.","url":"https://docs.mongodb.com/bi-connector/current/faq/index.html"},
            {"title":"mongodrdl — MongoDB Connector for BI 2.2","preview":"The mongodrdl command man page.","url":"https://docs.mongodb.com/bi-connector/current/reference/mongodrdl/index.html"},
            {"title":"Query a Backup Snapshot — MongoDB Atlas","preview":"Atlas provides queryable backups. This functionality allows you to query specific backup snapshot. You can use the queryable backups to:","url":"https://docs.atlas.mongodb.com/query-backup/index.html"},
            {"title":"mongosqld — MongoDB Connector for BI 2.2","preview":"The mongosqld command man page.","url":"https://docs.mongodb.com/bi-connector/current/reference/mongosqld/index.html"},
            {"title":"Create a Cluster — MongoDB Atlas","preview":"Atlas-managed MongoDB deployments, or “clusters”, can be either a replica set or a sharded cluster.","url":"https://docs.atlas.mongodb.com/create-new-cluster/index.html"}])

        const result2 = await index.search(new Query('aggregation'), ["atlas-master", "bi-connector-master"])
        deepStrictEqual(result, result2)

        result = await index.search(new Query('aggregation'), ["bi-connector-master"])
        deepStrictEqual(result, [
            {"title":"Schema Configuration — MongoDB Connector for BI 2.2","preview":"Business intelligence tools connect to a data source and, given a fixed tabular schema, allow the user to visually explore their data. As MongoDB uses a flexible schema, these tools currently cannot use MongoDB as a native data source.","url":"https://docs.mongodb.com/bi-connector/current/schema-configuration/index.html"},
            {'title':'MongoDB Reference — MongoDB Atlas','preview':'For a comprehensive documentation of MongoDB, refer to the MongoDB Manual. The following sections in the manual provide some starting points for developing with MongoDB.','url':'https://docs.atlas.mongodb.com/mongodb-reference/index.html'},
            {'title':'Release Notes for MongoDB Connector for BI — MongoDB Connector for BI 2.2','preview':'Supports authenticating directly against MongoDB using the new C and JDBC authentication plugins. These plugins support SCRAM-SHA-1 and PLAIN mechanisms and remove the SSL requirement for authentication. The authentication plugins can be found on GitHub:','url':'https://docs.mongodb.com/bi-connector/current/release-notes/index.html'},
            {"title": "FAQ: The MongoDB Connector for BI — MongoDB Connector for BI 2.2","preview": "Changed in version 2.0: Prior to version 2.0, the MongoDB Connector for BI stored its own separate set of credentials.","url": "https://docs.mongodb.com/bi-connector/current/faq/index.html"},
            {'title':'mongodrdl — MongoDB Connector for BI 2.2','preview':'The mongodrdl command man page.','url':'https://docs.mongodb.com/bi-connector/current/reference/mongodrdl/index.html'},
            {"title": "Query a Backup Snapshot — MongoDB Atlas","preview": "Atlas provides queryable backups. This functionality allows you to query specific backup snapshot. You can use the queryable backups to:","url": "https://docs.atlas.mongodb.com/query-backup/index.html"},
            {"title": "mongosqld — MongoDB Connector for BI 2.2","preview": "The mongosqld command man page.","url": "https://docs.mongodb.com/bi-connector/current/reference/mongosqld/index.html"},
            {"title": "Create a Cluster — MongoDB Atlas","preview": "Atlas-managed MongoDB deployments, or “clusters”, can be either a replica set or a sharded cluster.","url": "https://docs.atlas.mongodb.com/create-new-cluster/index.html"}])

        const result3 = await index.search(new Query('aggregation'), ["bi-connector-alias"])
        deepStrictEqual(result, result3)
    })

    after(async function() {
        // await client.db(TEST_DATABASE).collection("documents").deleteMany({})
        await client.close()
    })
})
