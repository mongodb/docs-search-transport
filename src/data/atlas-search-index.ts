import { IndexMappings } from './atlas-types';

const SYNONYM_COLLECTION_NAME = process.env['SYNONYM_COLLECTION_NAME'] || 'synonyms';

export const SearchIndex: IndexMappings = {
  mappings: {
    dynamic: false,
    fields: {
      code: {
        fields: {
          lang: [
            {
              dynamic: true,
              type: 'document',
            },
            {
              type: 'string',
              analyzer: 'lucene.standard',
              multi: {
                synonymAnalyzer: {
                  analyzer: 'synonym.whitespace',
                  type: 'string',
                },
              },
            },
          ],
          value: [
            {
              dynamic: true,
              type: 'document',
            },
            {
              analyzer: 'lucene.whitespace',
              multi: {
                simple: {
                  analyzer: 'lucene.simple',
                  store: false,
                  type: 'string',
                },
                synonymAnalyzer: {
                  analyzer: 'synonym.whitespace',
                  type: 'string',
                },
              },
              searchAnalyzer: 'lucene.whitespace',
              type: 'string',
            },
          ],
        },
        type: 'document',
      },
      headings: {
        analyzer: 'lucene.english',
        multi: {
          whitespace: {
            analyzer: 'custom.whitespace',
            store: false,
            type: 'string',
          },
          synonymAnalyzer: {
            analyzer: 'synonym.whitespace',
            type: 'string',
          },
        },
        searchAnalyzer: 'lucene.english',
        store: false,
        type: 'string',
      },
      paragraphs: {
        analyzer: 'lucene.english',
        searchAnalyzer: 'lucene.english',
        type: 'string',
        multi: {
          synonymAnalyzer: {
            analyzer: 'synonym.whitespace',
            type: 'string', 
          },
        },
      },
      strippedSlug: {
        analyzer: 'lucene.keyword',
        searchAnalyzer: 'lucene.keyword',
        type: 'string',
      },
      tags: {
        analyzer: 'lucene.english',
        indexOptions: 'freqs',
        searchAnalyzer: 'lucene.english',
        store: false,
        type: 'string',
      },
      text: {
        type: 'string',
        analyzer: 'lucene.standard',
        multi: {
          synonymAnalyzer: {
            analyzer: 'synonym.whitespace',
            type: 'string',
          },
        },
      },
      title: {
        analyzer: 'lucene.english',
        multi: {
          whitespace: {
            analyzer: 'custom.whitespace',
            store: false,
            type: 'string',
          },
          synonymAnalyzer: {
            analyzer: 'synonym.whitespace',
            type: 'string',
          },
        },
        searchAnalyzer: 'lucene.english',
        store: false,
        type: 'string',
      },
      searchProperty: {
        type: 'string',
      },
      includeInGlobalSearch: {
        type: 'boolean',
      },
    },
  },
  synonyms: [
    {
      name: 'synonym-mapping',
      source: {
        collection: SYNONYM_COLLECTION_NAME,
      },
      analyzer: 'synonym.whitespace',
    },
  ],
  analyzers: [
    {
      name: 'synonym.whitespace',
      tokenizer: {
        type: 'whitespace',
      },
      tokenFilters: [{ type: 'lowercase' }],
    },
    {
      charFilters: [],
      name: 'custom.whitespace',
      tokenFilters: [
        {
          matches: 'all',
          pattern: '^(?!\\$)\\w+',
          replacement: '',
          type: 'regex',
        },
        {
          type: 'stopword',
          tokens: [''],
        },
      ],
      tokenizer: {
        type: 'whitespace',
      },
    },
  ],
};
