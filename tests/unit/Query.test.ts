import { deepStrictEqual, ok } from 'assert';
import { Query } from '../../src/Query';
import { CompoundPart } from '../../src/Query/types';

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

  it('should look for the phrase as a compound should with a boost', () => {
    const query = new Query('max disk iops');
    const compound = query.getCompound(null, []);
    const phrase = compound.should.find((compoundPart) => {
      return (
        typeof compoundPart['phrase' as keyof CompoundPart] === 'object' &&
        typeof compoundPart['phrase' as keyof CompoundPart]['score'] === 'object'
      );
    });
    ok(phrase);
  });
});
