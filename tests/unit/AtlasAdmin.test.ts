import { strictEqual, deepStrictEqual, ok } from 'assert';
import { AtlasAdminManager, _getFacetKeys } from '../..//src/AtlasAdmin';

// import { request, RequestOptions } from 'urllib'; have to mock these

describe('Atlas Admin Manager', () => {
  // TODO: stub the urllib calls with sinon and add expected url/requestOptions
  describe('patchSearchIndex', () => {
    it('makes a digest auth request to find Search Index', async () => {

    });

    it('makes a request to create search index if not found', async () => {

    });

    it('makes a request to update search index if found', async () => {

    });

    it('propagates errors from all stages', async () => {
      // call multiple times
      // mock with if statements for parameters
    });
  });

  describe('_getFacetKeys', () => {
    it('converts a Taxonomy object to a list of strings with encodings', async () => {
      
    });
  })
});