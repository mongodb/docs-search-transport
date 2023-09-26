import { strictEqual, deepStrictEqual } from 'assert';
import { joinUrl, convertTaxonomyToResponseFormat } from '../../src/SearchIndex/util';
import { sampleFacetTrie, sampleTaxonomy } from '../resources/utils-data';

describe('SearchIndex', function () {
  it('correctly joins base URLs with slugs', function () {
    strictEqual(joinUrl('https://example.com//', '//foo/'), 'https://example.com/foo/');
    strictEqual(joinUrl('https://example.com', 'foo'), 'https://example.com/foo');
  });

  describe('convertTaxonomyToResponseFormat', () => {
    it('converts taxonomy object into a trie structure', () => {
      const input = sampleTaxonomy;
      const expected = sampleFacetTrie;
      deepStrictEqual(convertTaxonomyToResponseFormat(input), expected);
    });
  });
});
