import { strictEqual } from 'assert';
import { isPermittedOrigin, arrayEquals } from './util';

describe('util', function () {
  it('arrayEquals()', function () {
    strictEqual(arrayEquals([1, 2, 3], [1, 2, 3, 4]), false);
    strictEqual(arrayEquals([1, 2, 3, 4], [1, 2, 3]), false);
    strictEqual(arrayEquals([1, 2, 3], [1, 2, 4]), false);
    strictEqual(arrayEquals([1, 2, 4], [1, 2, 3]), false);
    strictEqual(arrayEquals([], []), true);
    strictEqual(arrayEquals([1, 2], [1, 2]), true);
  });

  it('isPermittedOrigin()', function () {
    strictEqual(isPermittedOrigin(new URL('https://example.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://examplemongodb.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://docs.mongodb.com.evil.com/')), false);
    strictEqual(isPermittedOrigin(new URL('https://docs.mongodb.com/')), true);
    strictEqual(isPermittedOrigin(new URL('https://docs.atlas.mongodb.com/reference/atlas-limits/')), true);
    strictEqual(isPermittedOrigin(new URL('https://mongodb.com')), true);
    strictEqual(isPermittedOrigin(new URL('http://docs.mongodb.com/')), false);
  });
});
