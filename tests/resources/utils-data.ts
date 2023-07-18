import { FacetDisplayNames, Taxonomy } from '../../src/SearchIndex';

export const sampleTaxonomy = {
  genres: [{ name: 'reference' }, { name: 'tutorial' }],
  target_platforms: [
    { name: 'atlas', versions: [{ name: 'v1.2' }, { name: 'master' }] },
    {
      name: 'atlas-cli',
      display_name: 'Atlas CLI',
      versions: [{ name: 'v1.2', stable: true }, { name: 'master' }],
    },
    {
      name: 'manual',
      versions: [{ name: 'v1.0' }, { name: 'master' }],
    },
    {
      name: 'spark-connector',
      display_name: 'Spark Connector',
      versions: [{ name: 'v2.0' }, { name: 'v2.1' }],
    },
    { name: 'node', versions: [{ name: 'v4.9' }] },
    {
      name: 'mongocli',
      display_name: 'Mongo CLI',
      versions: [{ name: 'v1.0' }],
    },
    { name: 'visual-studio-extension', versions: [{ name: 'current' }] },
    { name: 'golang', versions: [{ name: 'v1.7' }] },
    { name: 'java', versions: [{ name: 'v4.3' }] },
  ],
} as Taxonomy;

export const sampleFacetTrie = {
  genres: {
    name: 'Genres',
    reference: { name: 'Reference' },
    tutorial: { name: 'Tutorial' },
  },
  target_platforms: {
    name: 'Target Platforms',
    atlas: {
      name: 'Atlas',
      versions: {
        name: 'Versions',
        'v1.2': { name: 'v1.2' },
        master: { name: 'master' },
      },
    },
    'atlas-cli': {
      name: 'Atlas CLI',
      versions: {
        name: 'Versions',
        'v1.2': { name: 'v1.2', stable: true },
        master: { name: 'master' },
      },
    },
    manual: {
      name: 'Manual',
      versions: {
        name: 'Versions',
        'v1.0': { name: 'v1.0' },
        master: { name: 'master' },
      },
    },
    'spark-connector': {
      name: 'Spark Connector',
      versions: {
        name: 'Versions',
        'v2.0': { name: 'v2.0' },
        'v2.1': { name: 'v2.1' },
      },
    },
    node: {
      name: 'Node',
      versions: { name: 'Versions', 'v4.9': { name: 'v4.9' } },
    },
    mongocli: {
      name: 'Mongo CLI',
      versions: { name: 'Versions', 'v1.0': { name: 'v1.0' } },
    },
    'visual-studio-extension': {
      name: 'Visual Studio Extension',
      versions: { name: 'Versions', current: { name: 'current' } },
    },
    golang: {
      name: 'Golang',
      versions: { name: 'Versions', 'v1.7': { name: 'v1.7' } },
    },
    java: {
      name: 'Java',
      versions: { name: 'Versions', 'v4.3': { name: 'v4.3' } },
    },
  },
} as FacetDisplayNames;
