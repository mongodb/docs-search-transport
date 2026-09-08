import { deepStrictEqual, ok, rejects, strictEqual } from 'assert';
import * as sinon from 'sinon';
import Marian from '../../src/Marian';
import { isPermittedOrigin, arrayEquals } from '../../src/Marian/util';
import { getPropertyMapping } from '../../src/SearchPropertyMapping';

describe('util', function () {
  it('arrayEquals()', function () {
    strictEqual(arrayEquals([1, 2, 3], [1, 2, 3, 4]), false);
    strictEqual(arrayEquals([1, 2, 3, 4], [1, 2, 3]), false);
    strictEqual(arrayEquals([1, 2, 3], [1, 2, 4]), false);
    strictEqual(arrayEquals([1, 2, 4], [1, 2, 3]), false);
    strictEqual(arrayEquals([], []), true);
    strictEqual(arrayEquals([1, 2], [1, 2]), true);
  });

  it('isPermittedOrigin()', function () {
    strictEqual(isPermittedOrigin(new URL('https://example.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://examplemongodb.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://docs.mongodb.com.evil.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://docs.mongodb.com/')), true);
    strictEqual(isPermittedOrigin(new URL('https://docs.atlas.mongodb.com/reference/atlas-limits/')), true);
    strictEqual(isPermittedOrigin(new URL('https://mongodb.com')), true);
    strictEqual(isPermittedOrigin(new URL('http://docs.mongodb.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://docs-mongodb-org-stg.s3.us-east-2.amazonaws.com')), true);
    strictEqual(isPermittedOrigin(new URL('http://example.s3.us-east-2.amazonaws.com')), false);
    strictEqual(isPermittedOrigin(new URL('https://evil-mongodb-org-stg.s3.us-east-2.amazonaws.com')), false);
  });
});

describe('Marian load()', function () {
  const SAMPLE_MAPPING = {
    'manual-manual': { categoryTitle: 'MongoDB Manual', versionSelectorLabel: '8.3 (Current)' },
  };
  const originalMappingUrl = process.env.SEARCH_MAPPING_URL;
  const originalTaxonomyUrl = process.env.TAXONOMY_URL;

  let fetchStub: sinon.SinonStub;
  let index: any;
  let atlasAdmin: any;
  let server: Marian;

  const mappingResponse = () => ({ ok: true, status: 200, statusText: 'OK', json: async () => SAMPLE_MAPPING });
  const taxonomyResponse = () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' });

  // fetch is used for both the taxonomy (text) and the mapping (json).
  const stubFetch = (mappingFails: boolean) => {
    fetchStub.callsFake(async (url: string) => {
      if (url === process.env.TAXONOMY_URL) return taxonomyResponse();
      if (mappingFails) throw new Error('docs site unavailable');
      return mappingResponse();
    });
  };

  beforeEach(() => {
    process.env.TAXONOMY_URL = 'https://example.com/taxonomy.toml';
    process.env.SEARCH_MAPPING_URL = 'https://example.com/api/search-mapping/';
    fetchStub = sinon.stub(global, 'fetch' as any);
    index = { load: sinon.stub().resolves(), manifests: [] };
    atlasAdmin = { updateSynonyms: sinon.stub().resolves(), patchSearchIndex: sinon.stub().resolves() };
    server = new Marian(index as any, atlasAdmin as any);
  });

  afterEach(() => {
    fetchStub.restore();
    if (originalMappingUrl === undefined) delete process.env.SEARCH_MAPPING_URL;
    else process.env.SEARCH_MAPPING_URL = originalMappingUrl;
    if (originalTaxonomyUrl === undefined) delete process.env.TAXONOMY_URL;
    else process.env.TAXONOMY_URL = originalTaxonomyUrl;
  });

  it('fails at startup when the mapping cannot be fetched', async () => {
    stubFetch(true);
    await rejects(server.load(true, true), /docs site unavailable/);
    strictEqual(index.load.called, false, 'manifests should not be ingested if startup fails');
  });

  it('keeps indexing on refresh when the mapping cannot be fetched', async () => {
    // Load a good mapping first, as startup would.
    stubFetch(false);
    await server.load(true, true);
    deepStrictEqual(getPropertyMapping(), SAMPLE_MAPPING);

    // The docs site then goes down while a refresh is in flight.
    stubFetch(true);
    await server.load();

    ok(index.load.calledTwice, 'manifest ingestion should still run on a failed mapping refresh');
    deepStrictEqual(getPropertyMapping(), SAMPLE_MAPPING, 'the previous mapping should be kept');
  });
});
