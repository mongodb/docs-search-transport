import { deepStrictEqual, ok, rejects, strictEqual } from 'assert';
import * as sinon from 'sinon';

import { getPropertyMapping, setPropertyMapping } from '../../src/SearchPropertyMapping';

const SAMPLE_MAPPING = {
  'manual-manual': { categoryTitle: 'MongoDB Manual', versionSelectorLabel: '8.3 (Current)' },
  'manual-upcoming': { categoryTitle: 'MongoDB Manual', versionSelectorLabel: '9.0 (Upcoming)' },
  'compass-main': { categoryTitle: 'Compass', versionSelectorLabel: 'latest stable' },
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => body,
});

describe('SearchPropertyMapping', () => {
  const originalUrl = process.env.SEARCH_MAPPING_URL;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    process.env.SEARCH_MAPPING_URL = 'https://example.com/api/search-mapping/';
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    fetchStub.restore();
    if (originalUrl === undefined) {
      delete process.env.SEARCH_MAPPING_URL;
    } else {
      process.env.SEARCH_MAPPING_URL = originalUrl;
    }
  });

  it('fetches the mapping and exposes it through getPropertyMapping', async () => {
    fetchStub.resolves(okResponse(SAMPLE_MAPPING));

    const mapping = await setPropertyMapping();

    deepStrictEqual(mapping, SAMPLE_MAPPING);
    deepStrictEqual(getPropertyMapping(), SAMPLE_MAPPING);
    strictEqual(fetchStub.firstCall.args[0], 'https://example.com/api/search-mapping/');
  });

  it('throws when SEARCH_MAPPING_URL is missing', async () => {
    delete process.env.SEARCH_MAPPING_URL;
    await rejects(setPropertyMapping(), /Missing SEARCH_MAPPING_URL/);
    ok(fetchStub.notCalled, 'should not attempt a request without a URL');
  });

  it('throws on a non-2xx response', async () => {
    fetchStub.resolves({ ok: false, status: 503, statusText: 'Service Unavailable' });
    await rejects(setPropertyMapping(), /503/);
  });

  describe('rejecting unusable payloads', () => {
    // An empty mapping fails open rather than closed: Query.getCompound() only
    // applies the searchProperty allowlist when the mapping has keys, so an empty
    // object would widen global search to inactive and noIndexing properties.
    it('rejects an empty object', async () => {
      fetchStub.resolves(okResponse({}));
      await rejects(setPropertyMapping(), /empty/);
    });

    it('rejects an array', async () => {
      fetchStub.resolves(okResponse([]));
      await rejects(setPropertyMapping(), /not an object/);
    });

    it('rejects null', async () => {
      fetchStub.resolves(okResponse(null));
      await rejects(setPropertyMapping(), /not an object/);
    });
  });

  it('keeps the previous mapping when a later refresh fails', async () => {
    fetchStub.resolves(okResponse(SAMPLE_MAPPING));
    await setPropertyMapping();

    fetchStub.resolves(okResponse({}));
    await rejects(setPropertyMapping(), /empty/);

    // The cached mapping is only replaced after a successful fetch.
    deepStrictEqual(getPropertyMapping(), SAMPLE_MAPPING);
  });
});
