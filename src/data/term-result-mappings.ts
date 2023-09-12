const resultMapping: ResultMapping = {
  and: ['reference/operator/query/and'],
  or: ['reference/operator/query/or'],
  in: ['reference/operator/query/in'],
  findbyid: ['reference/command/find'],
  findbyidandupdate: ['reference/command/findAndModify'],
  like: ['reference/operator/query/regex'],
  'not equal': ['reference/operator/query/ne'],
  'and operator': ['reference/operator/query/and'],
  'in operator': ['reference/operator/query/in'],
  'mongodb.conf': ['reference/configuration-options'],
  createcollection: ['reference/method/db.createCollection'],
  not: ['reference/operator/query/not/'],
  get: ['reference/command/find/'],
  aggregate: ['reference/command/aggregate'],
  $project: ['reference/operator/aggregation/project'],
  project: ['reference/operator/aggregation/project'],
  group: ['reference/operator/aggregation/group'],
};

// Strips the result mapping of any '/' characters
export const strippedMapping: ResultMapping = Object.fromEntries(
  Object.entries(resultMapping).map((e) => [e[0], e[1].map((r) => r.replaceAll('/', ''))])
);

// Values are subject to change, but each key should have a string array.
interface ResultMapping {
  [key: string]: string[];
}
