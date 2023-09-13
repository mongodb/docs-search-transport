const resultMapping: ResultMapping = {
  and: ['reference/operator/query/and', 'reference/operator/aggregation/and', 'reference/operator/query/all'],
  or: ['reference/operator/query/or', 'reference/operator/aggregation/or', 'reference/sql-comparison'],
  in: ['reference/operator/query/in', 'reference/operator/aggregation/in', 'reference/operator/query/all'],
  findbyid: ['reference/command/find', 'partner-integrations', 'reference/partner-integrations/vercel/'],
  findbyidandupdate: [
    'reference/command/findAndModify',
    'reference/method/db.collection.findAndModify',
    'partner-integrations',
  ],
  like: ['reference/operator/query/regex', 'reference/operator/aggregation/match', 'atlas-search/morelikethis'],
  'not equal': ['reference/operator/query/ne', 'reference/operator/aggregation/ne', 'reference/operator/query/not'],
  'and operator': [
    'reference/operator/query/and',
    'reference/operator/aggregation/and',
    'reference/operator/query/all',
  ],
  'in operator': ['reference/operator/query/in', 'reference/operator/aggregation/in', 'reference/operator/query/all'],
  'mongodb.conf': [
    'administration/configuration',
    'reference/configuration-file-settings-command-line-options-mapping',
    'reference/program/mongod',
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
  aggregation: ['aggregation'],
  projection: ['reference/operator/projection/positional', 'reference/operator/projection', 'reference/operator/query'],
  operators: ['reference/operator/query', 'reference/operator/update', 'reference/operator/aggregation-pipeline'],
  set: [
    'reference/operator/update/set',
    'reference/operator/aggregation/set',
    'tutorial/update-documents-with-aggregation-pipeline',
  ],
  map: [
    'reference/operator/aggregation/map',
    'tutorial/update-documents-with-aggregation-pipeline',
    'tutorial/implement-field-level-redaction',
  ],
  limit: [
    'reference/operator/aggregation/limit',
    'reference/method/cursor.limit/',
    'reference/sql-aggregation-comparison',
  ],
  operator: ['reference/operator/query', 'reference/operator/update', 'reference/operator/aggregation-pipeline'],
  exists: ['reference/operator/query/exists', 'atlas-search/exists', 'fundamentals/crud/query-document'],
  mongoclient: [
    'fundamentals/connection/mongoclientsettings',
    'fundamentals/connection/mongoclientsettings',
    'sdk/java/api/io/realm/mongodb/mongo/MongoClient',
  ],
  mongocli: ['command/mongocli', 'install', 'configure'],
  connection: [
    'reference/connection-string',
    'reference/command/serverStatus',
    'administration/connection-pool-overview',
  ],
  contains: ['reference/operator/query/in', 'tutorial/query-arrays', 'reference/operator/aggregation/regexFindAll'],
  lt: ['reference/operator/query/lt', 'reference/operator/aggregation/lt', 'reference/operator/query/lte'],
  if: ['reference/operator/aggregation/cond', 'reference/operator/aggregation/switch', 'reference/operator/query/expr'],
  order: ['reference/sql-comparison/', 'reference/method/cursor.sort', 'reference/operator/aggregation/sort'],
  max: ['/operator/update/max', 'reference/operator/aggregation/max', 'reference/operator/aggregation/maxN'],
  select: [
    'reference/sql-comparison',
    'reference/sql-aggregation-comparison',
    'tutorial/project-fields-from-query-results',
  ],
  condition: ['reference/operator/aggregation/cond', 'tutorial/query-documents', 'reference/operator/query/expr'],
  relation: ['applications/data-models', 'introduction', 'core/data-modeling-introduction'],
};

// Strips the result mapping of any '/' characters
export const strippedMapping: ResultMapping = Object.fromEntries(
  Object.entries(resultMapping).map((e) => [e[0], e[1].map((r) => r.replaceAll('/', ''))])
);

// Values are subject to change, but each key should have a string array.
interface ResultMapping {
  [key: string]: string[];
}
