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
                luceneWhitespace: {
                  analyzer: 'lucene.whitespace',
                  type: 'string',
                },
              },
            },
          ],
          value: [
            {
              dynamic: true,
              type: 'document',
              //do i need to specify the analyzer here too? I think so??
            },
            {
              analyzer: 'lucene.whitespace',
              multi: {
                simple: {
                  analyzer: 'lucene.simple',
                  store: false,
                  type: 'string',
                },
              },
              searchAnalyzer: 'lucene.whitespace',
              type: 'string',
            },
          ],
        },
        type: 'document',
        //do i need to specify it here
      },
      headings: {
        analyzer: 'lucene.english',
        multi: {
          whitespace: {
            analyzer: 'custom.whitespace',
            store: false,
            type: 'string',
          },
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
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
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
            type: 'string',
          },
        },  
      },
      strippedSlug: {
        analyzer: 'lucene.keyword',
        searchAnalyzer: 'lucene.keyword',
        type: 'string',
        multi: {
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
            type: 'string',
          },
        },  
      },
      tags: {
        analyzer: 'lucene.english',
        indexOptions: 'freqs',
        searchAnalyzer: 'lucene.english',
        store: false,
        type: 'string',
        multi: {
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
            type: 'string',
          },
        },
      },
      text: {
        type: 'string',
        analyzer: 'lucene.standard',
        multi: {
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
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
          luceneWhitespace: {
            analyzer: 'lucene.whitespace',
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
      analyzer: 'lucene.whitespace',
    },
  ],
  analyzers: [
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
