import { strictEqual, deepStrictEqual } from 'assert';
import { joinUrl, convertTaxonomyResponse } from '../../src/SearchIndex/util';
import { sampleFacetOption, sampleTaxonomy } from '../resources/utils-data';

describe('SearchIndex', function () {
  it('correctly joins base URLs with slugs', function () {
    strictEqual(joinUrl('https://example.com//', '//foo/'), 'https://example.com/foo/');
    strictEqual(joinUrl('https://example.com', 'foo'), 'https://example.com/foo');
  });

  describe('convertTaxonomyResponse', () => {
    it('converts taxonomy object into a trie structure', () => {
      const input = sampleTaxonomy;
      const expected = sampleFacetOption;
      deepStrictEqual(convertTaxonomyResponse(input), expected);
    });
  });
});
