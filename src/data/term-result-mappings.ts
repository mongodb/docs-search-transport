const resultMapping: ResultMapping = {
  and: ['reference/operator/query/and', 'reference/operator/aggregation/and', 'reference/operator/query/all'],
  or: ['reference/operator/query/or', 'reference/operator/aggregation/or', 'reference/operator/query-logical'],
  in: ['reference/operator/query/in', 'reference/operator/aggregation/in', 'reference/method.db.collection.find'],
  findbyid: [
    'reference/command/find',
    'reference/method/db.collection.findOne',
    'reference/method/db.collection.findAndModify',
  ],
  findbyidandupdate: [
    'reference/command/findAndModify',
    'reference/method/db.collection.findAndModify',
    'reference/method/db.collection.findOneAndUpdate',
  ],
  like: ['reference/operator/query/regex', 'reference/operator/aggregation/match', 'atlas-search/morelikethis'],
  'not equal': ['reference/operator/query/ne', 'reference/operator/aggregation/ne', 'reference/operator/query/not'],
  'and operator': [
    'reference/operator/query/and',
    'reference/operator/aggregation/and',
    'reference/operator/query/all',
  ],
  'in operator': [
    'reference/operator/query/in',
    'reference/operator/aggregation/in',
    'reference/method.db.collection.find',
  ],
  'mongodb.conf': [
    'reference/configuration-options',
    'administration/configuration',
    'reference/configuration-file-settings-command-line-options-mapping',
  ],
  conf: [
    'reference/configuration-options',
    'administration/configuration',
    'reference/configuration-file-settings-command-line-options-mapping',
  ],
  createcollection: [
    'reference/method/db.createCollection',
    'reference/command/create',
    'core/databases-and-collections',
  ],
  not: ['reference/operator/query/not', 'reference/operator/aggregation/not', 'reference/operator/query/regex'],
  get: ['reference/command/find', 'tutorial/query-documents', 'reference/operator/aggregation/getField'],
  aggregate: ['reference/command/aggregate', 'aggregation', 'core/aggregation-pipeline'],
  $project: [
    'reference/operator/aggregation/project',
    'core/aggregation-pipeline-optimization',
    'reference/map-reduce-to-aggregation-pipeline',
  ],
  project: [
    'reference/operator/aggregation/project',
    'core/aggregation-pipeline-optimization',
    'reference/map-reduce-to-aggregation-pipeline',
  ],
  group: [
    'reference/operator/aggregation/group',
    'core/aggregation-pipeline',
    'reference/map-reduce-to-aggregation-pipeline',
  ],
  $group: [
    'reference/operator/aggregation/group',
    'core/aggregation-pipeline',
    'reference/map-reduce-to-aggregation-pipeline',
  ],
  aggregation: ['aggregation', 'core/aggregation-pipeline'],
  projection: [
    'reference/operator/projection',
    'reference/operator/aggregation/project',
    'tutorial/project-fields-from-query-results/',
  ],
  operators: ['reference/operator/query', 'reference/operator/update', 'reference/operator/aggregation-pipeline'],
  set: [
    'reference/operator/update/set',
    'reference/operator/aggregation/set',
    'tutorial/update-documents-with-aggregation-pipeline',
  ],
  $set: [
    'reference/operator/update/set',
    'reference/operator/aggregation/set',
    'tutorial/update-documents-with-aggregation-pipeline',
  ],
  map: [
    'reference/operator/aggregation/map',
    'tutorial/update-documents-with-aggregation-pipeline',
    'core/aggregation-pipeline',
  ],
  $map: [
    'reference/operator/aggregation/map',
    'tutorial/update-documents-with-aggregation-pipeline',
    'core/aggregation-pipeline',
  ],
  limit: [
    'reference/operator/aggregation/limit',
    'reference/method/cursor.limit/',
    'reference/sql-aggregation-comparison',
  ],
  $limit: [
    'reference/operator/aggregation/limit',
    'reference/method/cursor.limit/',
    'reference/sql-aggregation-comparison',
  ],
  operator: ['reference/operator/query', 'reference/operator/update', 'reference/operator/aggregation-pipeline'],
  exists: ['reference/operator/query/exists', 'atlas-search/exists', 'fundamentals/crud/query-document'],
  $exists: ['reference/operator/query/exists', 'atlas-search/exists', 'fundamentals/crud/query-document'],
  exist: ['reference/operator/query/exists', 'atlas-search/exists', 'fundamentals/crud/query-document'],
  mongoclient: [
    'drivers/kotlin/coroutine/current/fundamentals/connection/mongoclientsettings/',
    'drivers/java/sync/current/fundamentals/connection/mongoclientsettings/',
    'sdk/java/api/io/realm/mongodb/mongo/MongoClient',
  ],
  mongocli: ['command/mongocli', 'install', 'configure'],
  connection: ['reference/connection-string', 'reference/command/serverStatus', 'reference/command/connectionStatus'],
  contains: ['reference/operator/query/in', 'tutorial/query-arrays', 'reference/operator/aggregation/regexFindAll'],
  $contains: ['reference/operator/query/in', 'tutorial/query-arrays', 'reference/operator/aggregation/regexFindAll'],
  lt: ['reference/operator/query/lt', 'reference/operator/aggregation/lt', 'reference/operator/query/lte'],
  if: ['reference/operator/aggregation/cond', 'reference/operator/aggregation/switch', 'reference/operator/query/expr'],
  $if: [
    'reference/operator/aggregation/cond',
    'reference/operator/aggregation/switch',
    'reference/operator/query/expr',
  ],
  order: ['reference/sql-comparison/', 'reference/method/cursor.sort', 'reference/operator/aggregation/sort'],
  max: ['/operator/update/max', 'reference/operator/aggregation/max', 'reference/operator/aggregation/maxN'],
  select: [
    'reference/sql-comparison',
    'reference/sql-aggregation-comparison',
    'tutorial/project-fields-from-query-results',
  ],
  condition: ['reference/operator/aggregation/cond', 'tutorial/query-documents', 'reference/operator/query/expr'],
  relation: ['applications/data-models', 'introduction', 'core/data-modeling-introduction'],
  cond: ['reference/operator/aggregation/cond', 'tutorial/query-documents', 'reference/operator/query/expr'],
  node: ['node/current/', 'node/current/quick-start/', 'node/current/usage-examples/'],
  'node.js driver': ['node/current/', 'node/current/quick-start/', 'node/current/usage-examples/'],
  nodejs: ['node/current/', 'node/current/quick-start/', 'node/current/usage-examples/'],
  $filter: [
    'reference/operator/aggregation/filter',
    'reference/operator/aggregation',
    'reference/operator/projection/positional',
  ],
  $match: [
    'reference/operator/aggregation/match',
    'reference/operator/query/elemMatch',
    'reference/operator/aggregation/regexMatch',
  ],
  $push: [
    'reference/operator/update/push',
    'reference/operator/aggregation/push',
    'reference/operator/update/position/',
  ],
  $regex: ['reference/operator/query/regex', 'atlas/atlas-search/regex', 'reference/operator/aggregation/regexMatch/'],
  $eq: ['reference/operator/query/eq', 'reference/operator/aggregation/eq', 'reference/operator/query/elemMatch'],
  $size: ['reference/operator/query/size', 'reference/operator/aggregation/size', 'tutorial/query-arrays/'],
  $sort: [
    'reference/operator/update/sort',
    'reference/operator/aggregation/sort',
    'tutorial/aggregation-with-user-preference-data/',
  ],
  $inc: [
    'reference/operator/update/inc',
    'reference/method/db.collection.updateMany',
    'reference/method/db.collection.findAndModify',
  ],
  inc: [
    'reference/operator/update/inc',
    'reference/method/db.collection.updateMany',
    'reference/method/db.collection.findAndModify',
  ],
  $pull: ['reference/operator/update/pull', 'reference/operator/update/pullAll', 'reference/operator/update'],
  $reduce: ['reference/operator/aggregation/reduce', 'reference/operator/aggregation'],
  $all: [
    'reference/operator/query/all',
    'reference/operator/aggregation/regexFindAll',
    'reference/operator/update/pullAll',
  ],
  $facet: ['reference/operator/aggregation/facet', 'reference/operator/aggregation/bucket', 'atlas/atlas-search/facet'],
  $add: [
    'reference/operator/aggregation/add',
    'tutorial/update-documents-with-aggregation-pipeline',
    'reference/operator/aggregation/sum',
  ],
  $first: [
    'reference/operator/aggregation/first',
    'reference/operator/aggregation/firstN',
    'reference/operator/aggregation/firstN-array-element',
  ],
  $count: ['reference/operator/aggregation/count', 'reference/command/count', 'atlas/atlas-search/counting'],
  indexes: ['core/indexes'],
  $addFields: [
    'reference/operator/aggregation/addFields',
    'core/aggregation-pipeline-optimization',
    'reference/operator/aggregation-pipeline',
  ],
  $ifNull: [
    'reference/operator/aggregation/ifNull',
    'tutorial/query-for-null-fields',
    'reference/operator/query/elemMatch',
  ],
  datetime: ['reference/method/Date', 'reference/sql-comparison', 'core/timeseries-collections'],
  $avg: [
    'reference/operator/aggregation/avg',
    'tutorial/update-documents-with-aggregation-pipeline',
    'meta/aggregation-quick-reference',
  ],
  avg: [
    'reference/operator/aggregation/avg',
    'tutorial/update-documents-with-aggregation-pipeline',
    'meta/aggregation-quick-reference',
  ],
  $function: [
    'reference/operator/aggregation/function',
    'tutorial/map-reduce-examples',
    'reference/operator/query/where',
  ],
  $lte: ['reference/operator/query/lte', 'reference/operator/aggregation/lte', 'reference/sql-comparison'],
  $month: [
    'reference/operator/aggregation/month',
    'reference/operator/aggregation/dayOfMonth',
    'tutorial/aggregation-with-user-preference-data',
  ],
  $root: [
    'reference/aggregation-variables',
    'reference/operator/aggregation/replaceRoot',
    'reference/operator/aggregation/sqrt',
  ],
  $merge: [
    'reference/operator/aggregation/merge',
    'atlas/data-federation/supported-unsupported/pipeline/merge',
    'reference/operator/aggregation/mergeObjects',
  ],
  'queryable encryption': ['core/queryable-encryption'],
  realm: ['atlas/device-sdks/deprecation/'],
};

// Strips the result mapping of any '/' characters
export const strippedMapping: ResultMapping = Object.fromEntries(
  Object.entries(resultMapping).map((e) => [e[0], e[1].map((r) => r.replaceAll('/', ''))])
);

// Values are subject to change, but each key should have a string array.
interface ResultMapping {
  [key: string]: string[];
}
