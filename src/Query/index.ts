import { Filter, Document as mdbDocument } from 'mongodb';
import { getFacetAggregationStages, getProjectionAndFormatStages, tokenize } from './util';
import { Document, FacetOption } from '../SearchIndex/types';
import { getPropertyMapping } from '../SearchPropertyMapping';
import { strippedMapping } from '../data/term-result-mappings';
import { Part, CompoundPart, Compound } from './types';

export class InvalidQuery extends Error {}

function processPart(part: string): string[] {
  return tokenize(part, false);
}

const BURIED_PROPERTIES = ['realm'];
const BURIED_FACTOR = 0.8;

// each $search operator is expanded into two compound operators so that certain properties are buried
function constructBuryOperators(parts: Part[]): CompoundPart[] {
  const newParts: CompoundPart[] = [];
  for (const part of parts) {
    //push to two compounds for each part to the new array
    newParts.push(
      //if given query matches a "part" result not in BURIED_PROPERTY(ex: Realm) docs, score remains unaffected
      {
        compound: {
          must: [part],
          mustNot: [
            {
              text: {
                query: BURIED_PROPERTIES,
                path: 'searchProperty',
              },
            },
          ],
        },
      },
      //if given query matches a "part" result in BURIED_PROPERTY(ex: Realm) docs, bury that result
      {
        compound: {
          must: [
            part,
            {
              text: {
                query: BURIED_PROPERTIES,
                path: 'searchProperty',
              },
            },
          ],
          score: { boost: { value: BURIED_FACTOR } },
        },
      }
    );
  }
  return newParts;
}

/** A parsed search query. */
export class Query {
  terms: Set<string>;
  phrases: string[];
  rawQuery: string;

  /**
   * Create a new query.
   * @param {string} queryString The query to parse
   */
  constructor(queryString: string) {
    console.log('Query parsing: ' + queryString);
    this.terms = new Set();
    this.phrases = [];
    this.rawQuery = queryString;

    const parts = queryString.split(/((?:\s+|^)"[^"]+"(?:\s+|$))/);
    let inQuotes = false;
    for (const part of parts) {
      inQuotes = Boolean(part.match(/^\s*"/));

      if (!inQuotes) {
        this.addTerms(processPart(part));
      } else {
        const phraseMatch = part.match(/\s*"([^"]*)"?\s*/);
        if (!phraseMatch) {
          // This is a phrase fragment
          this.addTerms(processPart(part));
          continue;
        }

        const phrase = phraseMatch[1].toLowerCase().trim();
        this.phrases.push(phrase);

        const phraseParts = processPart(phrase);
        this.addTerms(phraseParts);
      }
    }
    if (!this.terms.size) {
      throw new InvalidQuery();
    }
  }

  addTerms(terms: string[]) {
    for (const term of terms) {
      this.terms.add(term);
    }
  }

  getCompound(searchProperty: string[] | null, filters: Filter<Document>[]): Compound {
    const terms = Array.from(this.terms);
    const parts: Part[] = [];
    const searchPropertyMapping = getPropertyMapping();

    // if we need to boost for matching slug on an exact rawQuery match
    if (strippedMapping[this.rawQuery.trim()]) {
      parts.push({
        text: {
          path: 'strippedSlug',
          query: strippedMapping[this.rawQuery.trim()],
          score: { boost: { value: 100 } },
        },
      });
    }

    parts.push({
      text: {
        query: terms,
        path: ['code.lang', 'paragraphs', 'code.value', 'text', { value: 'code.value', multi: 'simple' }],
      },
    });

    parts.push({
      text: {
        query: terms,
        path: [
          { value: 'paragraphs', multi: 'synonymAnalyzer' },
          { value: 'headings', multi: 'synonymAnalyzer' },
          { value: 'title', multi: 'synonymAnalyzer' },
          { value: 'text', multi: 'synonymAnalyzer' },
          { value: 'code.lang', multi: 'synonymAnalyzer' },
        ],
        synonyms: 'synonym-mapping',
      },
    });

    parts.push({
      text: {
        query: terms,
        path: 'headings',
        score: { boost: { value: 6 } },
      },
    });

    parts.push({
      text: {
        query: terms,
        path: { value: 'headings', multi: 'whitespace' },
        score: { boost: { value: 5 } },
      },
    });

    parts.push({
      text: {
        query: terms,
        path: 'title',
        score: { boost: { value: 15 } },
      },
    });

    parts.push({
      text: {
        query: terms,
        path: { value: 'title', multi: 'whitespace' },
        score: { boost: { value: 10 } },
      },
    });

    parts.push({
      text: {
        query: terms,
        path: 'tags',
        score: { boost: { value: 10 } },
      },
    });

    const compound: Compound = {
      should: constructBuryOperators(parts),
      minimumShouldMatch: 1,
      must: [],
    };
    const searchPropertyNames = Object.keys(searchPropertyMapping);

    // DOP-3976: phrases found in conjunction should have additional score boost if they are found in order
    if (terms.length > 1) {
      const maxLength: number = terms.reduce((max, term) => Math.max(max, term.length), 0);
      compound.should.push({
        phrase: {
          path: ['paragraphs', 'text', 'headings'],
          query: terms.join(' '),
          slop: maxLength,
          score: {
            boost: {
              value: 15,
            },
          },
        },
      });
    }

    // if user requested searchProperty, must match this property name
    // allowing mix usage of searchProperty and facets
    if (searchProperty !== null && searchProperty.length !== 0) {
      compound.must.push({
        phrase: {
          path: 'searchProperty',
          query: searchProperty,
        },
      });
    } else {
      compound.must.push({
        equals: {
          path: 'includeInGlobalSearch',
          value: true,
        },
      });

      // must match all searchPropertyNames indexed by server
      if (searchPropertyNames?.length) {
        compound.must.push({
          phrase: {
            path: 'searchProperty',
            query: searchPropertyNames,
          },
        });
      }
    }

    // if there are any phrases in quotes
    if (this.phrases.length > 0) {
      compound.must = compound.must.concat(
        this.phrases.map((phrase) => {
          return {
            phrase: {
              query: phrase,
              path: ['paragraphs', 'text', 'headings', 'code.value', 'title'],
            },
          };
        })
      );
    }

    if (filters?.length) {
      // facet filters are passed as nested compounds
      // each compound (as a whole) must be matched
      compound.must = compound.must.concat(filters);
    }
    return compound;
  }

  getMetaQuery(searchProperty: string[] | null, taxonomy: FacetOption[], filters: Filter<Document>[]): mdbDocument[] {
    const compound: Compound = this.getCompound(searchProperty, filters);

    const facets = getFacetAggregationStages(taxonomy);

    const agg = [
      {
        $searchMeta: {
          facet: {
            operator: { compound },
            facets: facets,
          },
        },
      },
    ];

    console.log('Executing ' + JSON.stringify(agg));
    return agg;
  }

  getAggregationQuery(searchProperty: string[] | null, filters: Filter<Document>[], page?: number): mdbDocument[] {
    if (page && page < 1) {
      throw new InvalidQuery('Invalid page');
    }
    const compound = this.getCompound(searchProperty, filters);

    const agg: mdbDocument[] = [
      {
        $search: {
          compound,
          tracking: {
            searchTerms: this.rawQuery,
          },
        },
      },
    ];

    const RES_COUNT = 50;
    const PAGINATED_RES_COUNT = 10;
    // projection
    agg.push(...getProjectionAndFormatStages());
    // count limit
    if (!page) {
      agg.push({ $limit: RES_COUNT });
    } else {
      agg.push({ $skip: PAGINATED_RES_COUNT * (page - 1) });
      agg.push({ $limit: PAGINATED_RES_COUNT });
    }
    console.log('Executing ' + JSON.stringify(agg));
    return agg;
  }
}
