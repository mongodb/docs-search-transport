import { FacetOption, Taxonomy } from '../../src/SearchIndex/types';

export const sampleTaxonomy = {
  genres: [{ name: 'reference' }, { name: 'tutorial' }],
  target_product: [
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

export const sampleFacetOption = [
  {
    type: 'facet-option',
    id: 'target_product',
    key: 'target_product',
    name: 'Target Product',
    options: [
      {
        type: 'facet-value',
        id: 'atlas',
        key: 'target_product',
        name: 'Atlas',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>atlas>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_product>atlas>versions',
                name: 'master',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'v1.2',
                key: 'target_product>atlas>versions',
                name: 'v1.2',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'atlas-cli',
        key: 'target_product',
        name: 'Atlas CLI',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>atlas-cli>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_product>atlas-cli>versions',
                name: 'master',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'v1.2',
                key: 'target_product>atlas-cli>versions',
                name: 'v1.2',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'golang',
        key: 'target_product',
        name: 'Golang',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>golang>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.7',
                key: 'target_product>golang>versions',
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
        key: 'target_product',
        name: 'Java',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>java>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v4.3',
                key: 'target_product>java>versions',
                name: 'v4.3',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'manual',
        key: 'target_product',
        name: 'Manual',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>manual>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'master',
                key: 'target_product>manual>versions',
                name: 'master',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'v1.0',
                key: 'target_product>manual>versions',
                name: 'v1.0',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'mongocli',
        key: 'target_product',
        name: 'Mongo CLI',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>mongocli>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v1.0',
                key: 'target_product>mongocli>versions',
                name: 'v1.0',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'node',
        key: 'target_product',
        name: 'Node',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>node>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v4.9',
                key: 'target_product>node>versions',
                name: 'v4.9',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'spark-connector',
        key: 'target_product',
        name: 'Spark Connector',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>spark-connector>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'v2.1',
                key: 'target_product>spark-connector>versions',
                name: 'v2.1',
                facets: [],
              },
              {
                type: 'facet-value',
                id: 'v2.0',
                key: 'target_product>spark-connector>versions',
                name: 'v2.0',
                facets: [],
              },
            ],
          },
        ],
      },
      {
        type: 'facet-value',
        id: 'visual-studio-extension',
        key: 'target_product',
        name: 'Visual Studio Extension',
        facets: [
          {
            type: 'facet-option',
            id: 'versions',
            key: 'target_product>visual-studio-extension>versions',
            name: 'versions',
            options: [
              {
                type: 'facet-value',
                id: 'current',
                key: 'target_product>visual-studio-extension>versions',
                name: 'current',
                facets: [],
              },
            ],
          },
        ],
      },
    ],
  },
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
] as FacetOption[];

export const sampleFacetKeys = [
  'genre',
  'target_product>atlas>sub_product',
  'target_product>realm>sub_product',
  'target_product',
  'programming_language',
];
