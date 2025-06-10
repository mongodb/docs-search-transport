import { strictEqual } from 'assert';
import { Query } from '../../src/Query';
import { SearchIndex } from '../../src/SearchIndex';
import { Taxonomy } from '../../src/SearchIndex/types';
import { MongoClient } from 'mongodb';
import { sampleFacetKeys } from '../resources/utils-data';
import * as dotenv from 'dotenv';

dotenv.config();

const TEST_DATABASE = 'search-test';

describe('Searching', function () {
  this.slow(200);

  const connectionString = process.env.ATLAS_URI;
  if (!connectionString) {
    return;
  }

  const client = new MongoClient(connectionString);
  let index: SearchIndex;

  this.beforeAll('Loading test data', async function (done) {
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
      // manually set facets to ensure test doesn't
      // fail due to empty facet text match
      index.facetKeys = sampleFacetKeys;
      console.log('index loaded');
      await index.createRecommendedIndexes();
      console.log('created recommended indexes');
      console.log(result);
      // I don't see a way to wait for indexing to complete, so... just sleep for some unscientific amount of time 🙃
      // if (result && (result.deleted || result.updated.length > 0)) {
      //   this.timeout(30000);
      //   return new Promise((resolve) => setTimeout(resolve, 10000));
      // }
      setTimeout(() => {
        done();
        return Promise.resolve();
      }, 10000);
      // return new Promise((resolve) => setTimeout(resolve, 10000));
    } catch (e) {
      console.error(e);
    }
  });

  // Test variants of searchProperty
  it('should properly handle incorrect urls in manifests', async () => {
    let result = await index.search(new Query('manual'), ['manual-v5.1'], [], 'manual', {});
    strictEqual(result[0]?.url, 'https://docs.mongodb.com/v5.1/index.html');
  });

  this.afterAll(async function () {
    // await client.db(TEST_DATABASE).collection("documents").deleteMany({})
    await client.close();
  });
});
