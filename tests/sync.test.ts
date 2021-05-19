import { strictEqual, deepStrictEqual } from "assert"
import { Db, MongoClient } from "mongodb";
import { SearchIndex, DatabaseDocument } from "../src/SearchIndex";

const DB = "search_testing"

const PATH_STATE_1 = "dir:tests/test_data/state-1"
const PATH_STATE_2 = "dir:tests/test_data/state-2"

function sortDocuments(documents: DatabaseDocument[]): void {
    documents.sort((a, b) => {
        const aFull = `${a.searchProperty}/${a.slug}`;
        const bFull = `${b.searchProperty}/${b.slug}`;
        return (aFull < bFull ? -1 : aFull > bFull ? 1 : 0)
    })
}

describe("Synchronization", function() {
    this.slow(1000)
    const client = new MongoClient("mongodb://localhost", {useUnifiedTopology: true});
    let index: SearchIndex

    before(function(done) {
        client.connect(async (err) => {
            strictEqual(err, null, `Error connecting to MongoDB: ${err}`)
            await client.db(DB).dropDatabase()
            index = new SearchIndex(PATH_STATE_1, client, DB)
            done()
        })
    })

    after(async function() {
        await client.close()
    })

    const loadInitialState = async () => {
        await index.load(PATH_STATE_1)
        const documentsCursor = client.db(DB).collection("documents")
        const documents = await documentsCursor.find().toArray()
        sortDocuments(documents)

        // Ensure that the correct slugs exist for state #1
        deepStrictEqual(documents.map((doc) => {
            return `${doc.searchProperty[0]}/${doc.slug}`
        }), [
            "bi-connector-v1/index.html",
            "bi-connector-v2/index.html",
            "manual/index.html",
            "manual/tutorial/index.html"
        ])

        // manual/tutorial/index.html has a typo: ensure that's present
        strictEqual(
            documents.filter((doc) => doc.searchProperty == "manual" && doc.slug === "tutorial/index.html")[0].title,
            "Create a Task Tracker Ap")
    };

    it("loads initial state", loadInitialState)

    it("loads disjoint state", async function() {
        await index.load(PATH_STATE_2)
        const documentsCursor = client.db(DB).collection("documents")
        const documents = await documentsCursor.find().toArray()
        sortDocuments(documents)

        // Ensure that the correct slugs exist for state #2
        deepStrictEqual(documents.map((doc) => {
            return `${doc.searchProperty[0]}/${doc.slug}`
        }), [
            "bi-connector-v2/index.html",
            "charts/index.html",
            "manual/index.html",
            "manual/tutorial/index.html",
            "manual/tutorial/second-tutorial/index.html"
        ])

        // manual/tutorial/index.html fixes a typo: ensure the fix is present
        strictEqual(
            documents.filter((doc) => doc.searchProperty == "manual" && doc.slug === "tutorial/index.html")[0].title,
            "Create a Task Tracker App")
    })

    it("loads initial state", loadInitialState)
});
