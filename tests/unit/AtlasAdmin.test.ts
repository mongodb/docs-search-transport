import { strictEqual, deepStrictEqual, ok, deepEqual } from 'assert';
import { parse } from 'toml';
import { AtlasAdminManager, _getFacetKeys } from '../..//src/AtlasAdmin';
import { Taxonomy } from '../../src/SearchIndex';

// import { request, RequestOptions } from 'urllib'; have to mock these

describe('Atlas Admin Manager', () => {
  // TODO: stub the urllib calls with sinon and add expected url/requestOptions
  describe('patchSearchIndex', () => {
    it('makes a digest auth request to find Search Index', async () => {});

    it('makes a request to create search index if not found', async () => {});

    it('makes a request to update search index if found', async () => {});

    it('propagates errors from all stages', async () => {});
  });

  describe('_getFacetKeys', () => {
    it('converts a Taxonomy object to a list of strings with encodings', async () => {
      const sample = `
      name = "Taxonomy"
    
      [[genres]]
      name = "genre1"
    
      [[genres]]
      name = "genre2"
    
      [[target_platforms]]
      name = "platform1"
      [[target_platforms.versions]]
      name = "v1"
      [[target_platforms.versions]]
      name = "v2"
    
      [[target_platforms]]
      name = "platform2"
      [[target_platforms.versions]]
      name = "v1"
      [[target_platforms.versions]]
      name = "v2"
      `;

      const res = _getFacetKeys(parse(sample) as Taxonomy);
      const expected = [
        'genres',
        'target_platforms←platform1→versions',
        'target_platforms←platform2→versions',
        'target_platforms',
      ];
      deepEqual(res, expected);
    });
  });
});
