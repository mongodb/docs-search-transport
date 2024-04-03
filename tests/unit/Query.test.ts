import { deepStrictEqual, ok } from 'assert';
import { Query } from '../../src/Query';

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

  it('should handle boosts on terms that are predefined in constant', () => {
    const nonExistingTermQuery = new Query('constructor').getCompound(null, []);
    ok((nonExistingTermQuery.should[0].compound.must[0].text?.score?.boost?.value as unknown as number) !== 100);
    const existingTermQuery = new Query('aggregation').getCompound(null, []);
    ok(existingTermQuery.should[0].compound.must[0].text?.score?.boost !== undefined);
    ok((existingTermQuery.should[0].compound.must[0].text?.score?.boost?.value as unknown as number) === 100);
  });
});
