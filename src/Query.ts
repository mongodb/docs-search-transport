'use strict';

import { Filter } from 'mongodb';
import { Document, FacetDisplayNames, Taxonomy } from './SearchIndex';

export class InvalidQuery extends Error {}

const CORRELATIONS = [
  ['regexp', 'regex', 0.8],
  ['regular expression', 'regex', 0.8],
  ['ip', 'address', 0.1],
  ['address', 'ip', 0.1],
  ['join', 'lookup', 0.6],
  ['join', 'sql', 0.25],
  ['aggregation', 'sql', 0.1],
  ['aggregation', 'pipeline', 0.1],
  ['least', 'min', 0.6],
  ['set security', 'keyfile', 1.0],
  ['cluster security', 'keyfile', 1.0],
  ['x509', 'x.509', 1.0],
  ['auth', 'authentication', 0.25],
];

const stopWords = new Set([
  'a',
  'able',
  'about',
  'across',
  'after',
  'all',
  'almost',
  'also',
  'am',
  'among',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'dear',
  'did',
  'do',
  'does',
  'either',
  'else',
  'ever',
  'every',
  'for',
  'from',
  'got',
  'had',
  'has',
  'have',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'how',
  'however',
  'i',
  'i.e.',
  'if',
  'important',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'may',
  'me',
  'might',
  'most',
  'must',
  'my',
  'neither',
  'no',
  'nor',
  'of',
  'off',
  'often',
  'on',
  'only',
  'or',
  'other',
  'our',
  'own',
  'rather',
  'said',
  'say',
  'says',
  'she',
  'should',
  'since',
  'so',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'tis',
  'to',
  'too',
  'twas',
  'us',
  'wants',
  'was',
  'we',
  'were',
  'what',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'yet',
  'you',
  'your',
  'e.g.',
]);

const atomicPhraseMap: Record<string, string> = {
  ops: 'manager',
  cloud: 'manager',
  real: 'time',
};
const atomicPhrases = new Set(Object.entries(atomicPhraseMap).map((kv) => kv.join(' ')));

const wordCache = new Map();

function isStopWord(word: string): boolean {
  return stopWords.has(word);
}

function tokenize(text: string, fuzzy: boolean): string[] {
  const components = text.split(/[^\w$%.]+/).map((token) => {
    return token.toLocaleLowerCase().replace(/(?:^\.)|(?:\.$)/g, '');
  });

  const tokens = [];
  for (let i = 0; i < components.length; i += 1) {
    const token = components[i];

    if (token == '$') {
      tokens.push('positional');
      tokens.push('operator');
      continue;
    }

    const nextToken = components[i + 1];
    if (nextToken !== undefined && atomicPhraseMap[token] === nextToken) {
      i += 1;
      tokens.push(`${token} ${atomicPhraseMap[token]}`);
      continue;
    }

    if (token.length > 1) {
      tokens.push(token);
    }

    const subtokens = token.split('.');
    if (fuzzy && subtokens.length > 1) {
      for (const subtoken of subtokens) {
        if (subtoken.length > 1) {
          tokens.push(subtoken);
        }
      }
    }
  }

  return tokens;
}

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

    const facets = _getFacetsForMeta(this.filters, taxonomyTrie);

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

export const extractFacetFilters = (searchParams: URL['searchParams']): Filter<Document> => {
  // query should be in form of:
  // q=test&facets.target_platforms>manual>versions=v6.0&facets.target_platforms=atlas
  // where each query param starting with 'facets.' denotes a filter and possible expansion
  // {
  //   "facets.target_platforms": ["manual", "atlas"],
  //   "facets.target_platforms>manual>versions": ["v6.0"]
  // }
  const filter: Filter<Document> = {};
  for (const [key, value] of searchParams) {
    if (!key.startsWith('facets.')) {
      continue;
    }
    const facetNames = key.replace('facets.', '').split('>');
    // hierarchy facets denoted by >
    // each facet node requires a facet property, at every even level
    for (let facetIdx = 0; facetIdx < facetNames.length; facetIdx += 2) {
      const facetName = facetNames[facetIdx];
      // construct partial facet name
      const prefix = facetIdx === 0 ? '' : facetNames.slice(0, facetIdx).join('>') + '>';
      const facetKey = `facets.${prefix}${facetName}`;
      if (!filter[facetKey]) {
        filter[facetKey] = [];
      }

      // the value is the next key in query param, or if there is no next key, the value itself
      const facetValue = facetIdx === facetNames.length - 1 ? value : facetNames[facetIdx + 1];
      filter[facetKey].push(facetValue);
    }
  }
  return filter;
};

const _getFacetsForMeta = (filter: Filter<Document>, taxonomy: FacetDisplayNames) => {
  const facets: { [key: string]: { type: 'string'; path: string } } = {};

  for (const baseFacet in taxonomy) {
    facets[baseFacet] = {
      type: 'string',
      path: `facets.${baseFacet}`,
    };
  }

  for (const [key, values] of Object.entries(filter)) {
    const facetKey = key.replace('facets.', '');
    for (const value of values) {
      const entry = _lookup(taxonomy, facetKey, value);
      if (typeof entry === 'object') {
        for (const entryKey in entry) {
          if (['name', 'displayName'].indexOf(entryKey) > -1) {
            continue;
          }
          facets[`${facetKey}>${value}>${entryKey}`] = {
            type: 'string',
            path: `${key}>${value}>${entryKey}`,
          };
        }
      }
    }
  }

  return facets;
};

const _lookup = (taxonomy: FacetDisplayNames, facetKey: string, value: string) => {
  let ref: { [key: string]: any } = taxonomy;

  const parts = facetKey.split('>');
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    if (ref[part]) {
      ref = ref[part];
    }
  }
  return ref[value];
};
