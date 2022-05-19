import { applyHeuristics } from './index'
import { deepStrictEqual } from 'assert';

const sampleFailureCase = {
    "_id": {
      "$oid": "6283e139687c7f1715eaf142"
    },
    "searchProperty": [
      "java-v4.3"
    ],
    "slug": "api-documentation/index.html",
    "headings": [
      "API Documentation"
    ],
    "includeInGlobalSearch": true,
    "links": [],
    "manifestRevisionId": "b878c801c3cc9c9c55c7c48fb8ef317d420c4e3e2731098bc9f7af07cc6ac451",
    "preview": "",
    "tags": "",
    "text": "API Documentation",
    "title": "API Documentation — Java",
    "url": "http://mongodb.com/docs/drivers/java/sync/v4.3/api-documentation/index.html"
  }

  describe('applyHeuristics', () => {
    it('should fail low content entries without mutating state', () => {
      const { unsearchable } = applyHeuristics([sampleFailureCase]);
      deepStrictEqual(unsearchable, [sampleFailureCase]);
    });
  });
  