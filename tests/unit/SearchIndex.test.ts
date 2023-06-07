import { strictEqual, deepStrictEqual, strict } from 'assert';
import { joinUrl, _convertFacets } from '../../src/SearchIndex';

describe('SearchIndex', function () {
  it('correctly joins base URLs with slugs', function () {
    strictEqual(joinUrl('https://example.com//', '//foo/'), 'https://example.com/foo/');
    strictEqual(joinUrl('https://example.com', 'foo'), 'https://example.com/foo');
  });

  describe('convertFacets', () => {
    it('converts nested facets of json structure to unnested key values denoting hierarchy', () => {
      const inputFacets = {
        target_platforms: [
          {
            name: 'atlas',
            versions: [
              {
                name: 'v1.2',
              },
              {
                name: 'v1.4',
              },
            ],
          },
        ],
        genres: [
          {
            name: 'reference',
          },
        ],
      };

      const expectedRes = {
        target_platforms: ['atlas'],
        'target_platforms←atlas→versions': ['v1.2', 'v1.4'],
        genres: ['reference'],
      };

      const res = _convertFacets(inputFacets);
      deepStrictEqual(res, expectedRes);
    });
  });
});
