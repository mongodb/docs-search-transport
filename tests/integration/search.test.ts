import { strictEqual } from 'assert';
import { Query } from '../../src/Query';
import { SearchIndex, Taxonomy } from '../../src/SearchIndex';
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
    const result = await index.load({} as Taxonomy);
    await index.createRecommendedIndexes();

    // I don't see a way to wait for indexing to complete, so... just sleep for some unscientific amount of time 🙃
    if (result && (result.deleted || result.updated.length > 0)) {
      this.timeout(8000);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });

  // Test variants of searchProperty
  it('should properly handle incorrect urls in manifests', async () => {
    let result = await index.search(new Query('manual'), ['manual-v5.1']);
    strictEqual(result[0].url, 'https://docs.mongodb.com/v5.1/index.html');
  });

  after(async function () {
    // await client.db(TEST_DATABASE).collection("documents").deleteMany({})
    await client.close();
  });
});
