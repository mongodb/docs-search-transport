import { strictEqual, deepStrictEqual, ok, deepEqual } from 'assert';
import { parse } from 'toml';
import { AtlasAdminManager, _getFacetKeys, parseSynonymCsv } from '../..//src/AtlasAdmin';
import { Taxonomy } from '../../src/SearchIndex';
import path from 'path';
import { readFileSync } from 'fs';

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

  describe('parseSynonymCsv', () => {
    it('returns an array of update operations with a properly parsed synonym array', () => {
      const expectedFilePath = path.join(__dirname, '../resources/expected-synonyms.json');
      const expectedSynonyms = JSON.parse(readFileSync(expectedFilePath).toString()) as Array<string[]>;

      const synonymUpdateDocs = parseSynonymCsv('../tests/resources/synonyms.csv');

      expect(expectedSynonyms.length).toEqual(synonymUpdateDocs.length);

      for (let i = 0; i < expectedSynonyms.length; i++) {
        const expectedSynonymArray = expectedSynonyms[i];
        const actualSynonymArray = synonymUpdateDocs[i]['updateOne']['update']['$set']['synonyms'];

        expect(expectedSynonymArray).toEqual(actualSynonymArray);

        const expectedPrimary = expectedSynonyms[i][0];
        const actualPrimary = synonymUpdateDocs[i]['updateOne']['update']['$set']['primary'];

        expect(expectedPrimary).toEqual(actualPrimary);
      }
    });
  });
});
