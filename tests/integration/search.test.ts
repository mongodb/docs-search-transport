import { strictEqual, deepStrictEqual, ok } from 'assert';
import { Query } from '../../src/Query';
import { SearchIndex } from '../../src/SearchIndex';
import { MongoClient } from 'mongodb';

const TEST_DATABASE = 'search-test';

describe('Searching', function () {
  this.slow(200);

  const connectionString = process.env.ATLAS_URI;
  if (!connectionString) {
    return;
  }

  const client = new MongoClient(connectionString);
  let index: SearchIndex;

  before('Loading test data', async function () {
    await client.connect();
    index = new SearchIndex('dir:tests/integration/search_test_data/', client, TEST_DATABASE);
    const result = await index.load();
    await index.createRecommendedIndexes();

    // I don't see a way to wait for indexing to complete, so... just sleep for some unscientific amount of time 🙃
    if (result.deleted || result.updated.length > 0) {
      this.timeout(8000);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });

  // Test variants of searchProperty
  it('should properly handle incorrect urls in manifests', async () => {
    let result = await index.search(new Query('manual'), ['manual-v5.1']);

    deepStrictEqual(result, [
      {
        preview:
          'MongoDB 5.1 release candidates are not yet available. This version of the manual is for an upcoming release and is currently a work in progress.',
        title: 'The MongoDB 5.1 Manual (Upcoming Release) — MongoDB Manual',
        url: 'https://docs.mongodb.com/v5.1/index.html',
      },
    ]);
  });

  after(async function () {
    // await client.db(TEST_DATABASE).collection("documents").deleteMany({})
    await client.close();
  });
});
