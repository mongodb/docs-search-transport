import { deepStrictEqual, ok } from 'assert';
import { Query } from '../../src/Query';
import { CompoundPart, NestedCompound } from '../../src/Query/types';
import { extractFacetFilters } from '../../src/Query/util';
import { sampleFacetOption } from '../resources/utils-data';

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
    const compound = query.getCompound(null, [], sampleFacetOption);
    const phrase = compound.should.find((compoundPart) => {
      return (
        typeof compoundPart['phrase' as keyof CompoundPart] === 'object' &&
        typeof compoundPart['phrase' as keyof CompoundPart]['score'] === 'object'
      );
    });
    ok(phrase);
  });

  it('should handle boosts on terms that are predefined in constant', () => {
    const nonExistingTermQuery = new Query('constructor').getCompound(null, [], sampleFacetOption);
    ok((nonExistingTermQuery.should[0] as NestedCompound).compound.must[0].text?.score?.boost?.value === undefined);
    const existingTermQuery = new Query('aggregation').getCompound(null, [], sampleFacetOption);
    ok((existingTermQuery.should[0] as NestedCompound).compound.must[0].text?.score?.boost !== undefined);
    ok(
      ((existingTermQuery.should[0] as NestedCompound).compound.must[0].text?.score?.boost
        ?.value as unknown as number) === 100
    );
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
