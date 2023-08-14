import { Filter } from 'mongodb';
import { getFacetsForMeta, tokenize } from './util';
import { Document, FacetDisplayNames } from '../SearchIndex/types';

export class InvalidQuery extends Error {}

function processPart(part: string): string[] {
  return tokenize(part, false);
}

/** A parsed search query. */
export class Query {
  terms: Set<string>;
  phrases: string[];
  rawQuery: string;
  filters: Filter<Document>;

  /**
   * Create a new query.
   * @param {string} queryString The query to parse
   */
  constructor(queryString: string, filters?: Filter<Document>) {
    console.log('Query parsing: ' + queryString);
    this.terms = new Set();
    this.phrases = [];
    this.rawQuery = queryString;
    this.filters = filters || {};

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

  getCompound() {
    const terms = Array.from(this.terms);
    const parts: any[] = [];

    parts.push({
      text: {
        query: terms,
        path: ['paragraphs', 'code.lang', 'code.value', 'text', { value: 'code.value', multi: 'simple' }],
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

    const compound: { should: any[]; must?: any[]; filter?: any[]; minimumShouldMatch: number } = {
      should: parts,
      minimumShouldMatch: 1,
    };

    // if there are any phrases in quotes
    if (this.phrases.length > 0) {
      compound['must'] = compound['must'] || [];
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

    return compound;
  }

  getMetaQuery(taxonomyTrie: FacetDisplayNames) {
    const compound = this.getCompound();

    const facets = getFacetsForMeta(this.filters, taxonomyTrie);

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

  getAggregationQuery(searchProperty: string[] | null): any[] {
    const filter =
      searchProperty !== null && searchProperty.length !== 0
        ? { searchProperty: { $elemMatch: { $in: searchProperty } } }
        : { includeInGlobalSearch: true };

    const compound = this.getCompound();

    const agg = [
      {
        $search: {
          compound,
          tracking: {
            searchTerms: this.rawQuery,
          },
        },
      },
      { $match: filter },
    ];
    console.log('Executing ' + JSON.stringify(agg));
    return agg;
  }
}
