import { strictEqual } from 'assert';
import { Query } from '../../src/Query';
import { SearchIndex } from '../../src/SearchIndex';
import { Taxonomy } from '../../src/SearchIndex/types';
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
    try {
      await client.connect();
      index = new SearchIndex(
        'dir:tests/integration/search_test_data/',
        'docs-search-indexes-test',
        'search-indexes/preprd',
        client,
        TEST_DATABASE
      );
      const result = await index.load({} as Taxonomy, 'dir:tests/integration/search_test_data/');
      console.log('index loaded');
      await index.createRecommendedIndexes();
      console.log('created recommended indexes');
      console.log(result);
    } catch (e) {
      console.error(e);
    }
  });

  // Test variants of searchProperty
  it('should properly handle incorrect urls in manifests', async () => {
    let result = await index.search(new Query('manual'), ['manual-v5.1'], []);
    strictEqual(result[0].url, 'https://docs.mongodb.com/v5.1/index.html');
  });

  after(async function () {
    // await client.db(TEST_DATABASE).collection("documents").deleteMany({})
    await client.close();
  });
});
