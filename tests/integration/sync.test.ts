import { strictEqual, deepStrictEqual } from 'assert';
import { Db, MongoClient } from 'mongodb';
import { SearchIndex, DatabaseDocument, Taxonomy } from '../../src/SearchIndex';

const DB = 'search-test';

const PATH_STATE_1 = 'dir:tests/integration/test_data/state-1';
const PATH_STATE_2 = 'dir:tests/integration/test_data/state-2';

function sortDocuments(documents: DatabaseDocument[]): void {
  documents.sort((a, b) => {
    const aFull = `${a.searchProperty}/${a.slug}`;
    const bFull = `${b.searchProperty}/${b.slug}`;
    return aFull < bFull ? -1 : aFull > bFull ? 1 : 0;
  });
}

describe('Synchronization', function () {
  this.slow(1000);
  const client = new MongoClient(process.env.ATLAS_URI || '');
  let index: SearchIndex;

  before(function (done) {
    client.connect().then(async () => {
      index = new SearchIndex(PATH_STATE_1, client, DB);
      done();
    });
  });

  after(async function () {
    await client.close();
  });

  const loadInitialState = async () => {
    await index.load({} as Taxonomy, PATH_STATE_1);
    const documentsCursor = client.db(DB).collection<DatabaseDocument>('documents');
    const documents = await documentsCursor.find().toArray();
    sortDocuments(documents);
    // Ensure that the correct slugs exist for state #1
    deepStrictEqual(
      documents.map((doc) => {
        return `${doc.searchProperty[0]}/${doc.slug}`;
      }),
      ['bi-connector-v1/index.html', 'bi-connector-v2/index.html', 'manual/index.html', 'manual/tutorial/index.html']
    );

    // manual/tutorial/index.html has a typo: ensure that's present
    strictEqual(
      documents.filter((doc) => doc.searchProperty.includes('manual') && doc.slug === 'tutorial/index.html')[0].title,
      'Create a Task Tracker Ap'
    );
  };

  it('loads initial state', loadInitialState);

  it('loads disjoint state', async function () {
    await index.load({} as Taxonomy, PATH_STATE_2);
    const documentsCursor = client.db(DB).collection<DatabaseDocument>('documents');
    const documents = await documentsCursor.find().toArray();
    sortDocuments(documents);

    // Ensure that the correct slugs exist for state #2
    deepStrictEqual(
      documents.map((doc) => {
        return `${doc.searchProperty[0]}/${doc.slug}`;
      }),
      [
        'bi-connector-v2/index.html',
        'charts/index.html',
        'manual/index.html',
        'manual/tutorial/index.html',
        'manual/tutorial/second-tutorial/index.html',
      ]
    );

    // manual/tutorial/index.html fixes a typo: ensure the fix is present
    strictEqual(
      documents.filter((doc) => doc.searchProperty.includes('manual') && doc.slug === 'tutorial/index.html')[0].title,
      'Create a Task Tracker App'
    );
  });

  it('loads initial state', loadInitialState);
});
