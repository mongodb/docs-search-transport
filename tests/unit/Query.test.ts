import { deepStrictEqual, ok } from 'assert';
import * as sinon from 'sinon';
import { Query } from '../../src/Query';
import { setPropertyMapping } from '../../src/SearchPropertyMapping';
import { Compound, CompoundPart, NestedCompound } from '../../src/Query/types';
import { extractFacetFilters } from '../../src/Query/util';
import { sampleFacetKeys } from '../resources/utils-data';

describe('Query', () => {
  it('should parse a single term', () => {
    const query = new Query('foo');
    deepStrictEqual(query.terms, new Set(['foo']));
    deepStrictEqual(query.phrases, []);
  });

  it('should delimit terms with any standard whitespace characters', () => {
    const query = new Query('foo   \t  bar');
    deepStrictEqual(query.terms, new Set(['foo', 'bar']));
    deepStrictEqual(query.phrases, []);
  });

  it('should parse multi-word phrases', () => {
    const query = new Query('foo "one phrase" bar "second phrase"');
    deepStrictEqual(query.terms, new Set(['foo', 'one', 'phrase', 'bar', 'second']));
    deepStrictEqual(query.phrases, ['one phrase', 'second phrase']);
  });

  it('should handle adjacent phrases', () => {
    const query = new Query('"introduce the" "officially supported"');
    deepStrictEqual(query.terms, new Set(['introduce', 'the', 'officially', 'supported']));
    deepStrictEqual(query.phrases, ['introduce the', 'officially supported']);
  });

  it('should handle a phrase fragment as a single phrase', () => {
    const query = new Query('"officially supported');
    deepStrictEqual(query.terms, new Set(['officially', 'supported']));
    deepStrictEqual(query.phrases, ['officially supported']);
  });

  it('should query a multi word phrase as its whole and boost its score', () => {
    const query = new Query('max disk iops');
    const compound = query.getCompound(null, [], sampleFacetKeys);
    const phrase = compound.should.find((compoundPart) => {
      return (
        typeof compoundPart['phrase' as keyof CompoundPart] === 'object' &&
        typeof compoundPart['phrase' as keyof CompoundPart]['score'] === 'object'
      );
    });
    ok(phrase);
  });

  it('should handle boosts on terms that are predefined in constant', () => {
    const nonExistingTermQuery = new Query('constructor').getCompound(null, [], sampleFacetKeys);
    ok((nonExistingTermQuery.should[0] as NestedCompound).compound.must[0].text?.score?.boost?.value === undefined);
    const existingTermQuery = new Query('aggregation').getCompound(null, [], sampleFacetKeys);
    const queryShould = existingTermQuery.should[0] as NestedCompound;
    ok(queryShould.compound.must[0].text?.score?.boost !== undefined);
    ok(queryShould.compound.must[0].text?.score?.boost?.value > 110);
    // Check for decreasing boost score, which ensures order matters in term result mapping
    const index = existingTermQuery.should.findIndex((compoundPart) => {
      return (compoundPart as NestedCompound).compound.must[0]?.text?.score?.boost?.value === 110;
    });
    ok(index !== -1);
  });

  it('should have as many clauses as filters passed into the query', () => {
    const searchParams = new URLSearchParams(
      `q=test&facets.target_product=drivers&facets.target_product>atlas>sub_product=atlas-cli&facets.programming_language=go`
    );
    const filters = extractFacetFilters(searchParams);
    const and = filters.length;
    // count number of OR clauses in each compound
    const or = filters.map((filter) => filter.compound.should.length);
    ok(and === 2 && or[0] === 2 && or[1] === 1);
  });
});

describe('Query search property allowlist', () => {
  // getCompound() is the only consumer of the search property mapping. It uses
  // Object.keys(mapping) to scope global search to indexed properties.
  const findSearchPropertyClause = (compound: Compound) =>
    compound.must.find((part: any) => part.phrase?.path === 'searchProperty') as any;

  const findGlobalSearchClause = (compound: Compound) =>
    compound.must.find((part: any) => part.equals?.path === 'includeInGlobalSearch') as any;

  let fetchStub: sinon.SinonStub;
  const originalUrl = process.env.SEARCH_MAPPING_URL;

  const loadMapping = async (mapping: Record<string, unknown>) => {
    process.env.SEARCH_MAPPING_URL = 'https://example.com/api/search-mapping/';
    fetchStub.resolves({ ok: true, status: 200, statusText: 'OK', json: async () => mapping });
    await setPropertyMapping();
  };

  beforeEach(() => {
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

  it('scopes global search to the mapping keys when no searchProperty is requested', async () => {
    await loadMapping({
      'manual-manual': { categoryTitle: 'MongoDB Manual', versionSelectorLabel: '8.3 (Current)' },
      'node-current': { categoryTitle: 'Node.js Driver', versionSelectorLabel: 'v7.x (current)' },
    });

    const compound = new Query('aggregation').getCompound(null, [], sampleFacetKeys);

    ok(findGlobalSearchClause(compound), 'global search should require includeInGlobalSearch');
    const allowlist = findSearchPropertyClause(compound);
    ok(allowlist, 'global search should be scoped by searchProperty');
    deepStrictEqual(allowlist.phrase.query, ['manual-manual', 'node-current']);
  });

  it('uses the requested searchProperty instead of the allowlist', async () => {
    await loadMapping({ 'manual-manual': {}, 'node-current': {} });

    const compound = new Query('aggregation').getCompound(['node-v6.x'], [], sampleFacetKeys);

    deepStrictEqual(findSearchPropertyClause(compound).phrase.query, ['node-v6.x']);
    ok(!findGlobalSearchClause(compound), 'an explicit searchProperty should not add the global search filter');
  });
});
