import { FacetDisplayNames, FacetOption, Taxonomy } from '../../src/SearchIndex/types';

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

export const sampleFacetTrie = [
  {
    type: 'facet-option',
    id: 'genres',
    key: 'genres',
    name: 'Genres',
    options: [
      {
        type: 'facet-value',
        id: 'reference',
        key: 'genres',
        name: 'Reference',
        facets: [],
      },
      {
        type: 'facet-value',
        id: 'tutorial',
        key: 'genres',
        name: 'Tutorial',
        facets: [],
      },
    ],
  },
  {
    type: 'facet-option',
    id: 'target_platforms',
    key: 'target_platforms',
    name: 'Target Platforms',
    options: [
      {
        type: 'facet-value',
        id: 'atlas',
        key: 'target_platforms',
        name: 'Atlas',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>atlas>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.2',
                key: 'target_platforms>atlas>versions',
                name: 'v1.2',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_platforms>atlas>versions',
                name: 'master',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'atlas-cli',
        key: 'target_platforms',
        name: 'Atlas CLI',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>atlas-cli>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.2',
                key: 'target_platforms>atlas-cli>versions',
                name: 'v1.2',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_platforms>atlas-cli>versions',
                name: 'master',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'manual',
        key: 'target_platforms',
        name: 'Manual',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>manual>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.0',
                key: 'target_platforms>manual>versions',
                name: 'v1.0',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_platforms>manual>versions',
                name: 'master',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'spark-connector',
        key: 'target_platforms',
        name: 'Spark Connector',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>spark-connector>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v2.0',
                key: 'target_platforms>spark-connector>versions',
                name: 'v2.0',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'v2.1',
                key: 'target_platforms>spark-connector>versions',
                name: 'v2.1',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'node',
        key: 'target_platforms',
        name: 'Node',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>node>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v4.9',
                key: 'target_platforms>node>versions',
                name: 'v4.9',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'mongocli',
        key: 'target_platforms',
        name: 'Mongo CLI',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>mongocli>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.0',
                key: 'target_platforms>mongocli>versions',
                name: 'v1.0',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'visual-studio-extension',
        key: 'target_platforms',
        name: 'Visual Studio Extension',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>visual-studio-extension>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'current',
                key: 'target_platforms>visual-studio-extension>versions',
                name: 'current',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'golang',
        key: 'target_platforms',
        name: 'Golang',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>golang>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.7',
                key: 'target_platforms>golang>versions',
                name: 'v1.7',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'java',
        key: 'target_platforms',
        name: 'Java',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_platforms>java>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v4.3',
                key: 'target_platforms>java>versions',
                name: 'v4.3',
                facets: [],
              },
            ],
          },
        ],
      },
    ],
  },
] as FacetOption[];
