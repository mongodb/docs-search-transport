'use strict';

import { InvalidQuery } from '.';
import { Taxonomy } from './SearchIndex';

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

  getAggregationQuery(searchProperty: string[] | null): any[] {
    const parts: any[] = [];
    const terms = Array.from(this.terms);

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
        score: { boost: { value: 5 } },
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
        score: { boost: { value: 10 } },
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

    const filter =
      searchProperty !== null && searchProperty.length !== 0
        ? { searchProperty: { $elemMatch: { $in: searchProperty } } }
        : { includeInGlobalSearch: true };

    const compound: { should: any[]; must?: any[]; minimumShouldMatch: number } = {
      should: parts,
      minimumShouldMatch: 1,
    };

    if (this.phrases.length > 0) {
      compound.must = this.phrases.map((phrase) => {
        return {
          phrase: {
            query: phrase,
            path: ['paragraphs', 'text', 'headings', 'code.value', 'title'],
          },
        };
      });
    }

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

  getFacetedAggregationQuery(searchProperty: string[] | null, selectedFacets: string[], taxonomy: Taxonomy): any[] {
    const parts: any[] = [];
    const terms = Array.from(this.terms);

    parts.push({
      text: {
        query: terms,
        path: ['paragraphs', 'code.lang', 'code.value', 'text'],
      },
    });
    parts.push({
      text: {
        query: terms,
        path: 'headings',
        score: { boost: { value: 5 } },
      },
    });
    parts.push({
      text: {
        query: terms,
        path: 'title',
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
    const filter =
      searchProperty !== null && searchProperty.length !== 0
        ? { searchProperty: { $elemMatch: { $in: searchProperty } } }
        : { includeInGlobalSearch: true };
    const compound: { should: any[]; must?: any[]; filter?: any[]; minimumShouldMatch: number } = {
      should: parts,
      minimumShouldMatch: 1,
    };

    // if any selected facets. add to filter part of compound operator
    compound.filter = getFiltersFromSelections(selectedFacets);

    const facets = getFacets(selectedFacets, taxonomy);

    const agg: any = [
      {
        $search: {
          facet: {
            operator: {
              compound: compound,
            },
            facets: facets,
          },
        },
      },
      { $match: filter },
    ];
    agg.push({
      $facet: {
        docs: [
          {
            $project: {
              _id: 0,
              title: 1,
              preview: 1,
              url: 1,
              searchProperty: 1,
            },
          },
          {
            $limit: 50,
          },
        ],
        meta: [{ $replaceWith: '$$SEARCH_META' }, { $limit: 1 }],
      },
    });
    agg.push({
      $unwind: {
        path: '$meta',
      },
    });
    console.log('Executing ' + JSON.stringify(agg));
    return agg;
  }
}

/**
 * gets filters required for compound operator
 * https://www.mongodb.com/docs/atlas/atlas-search/compound/#filter-examples
 */
const getFiltersFromSelections = (selectedFacets: string[]) => {
  const filters = [];
  for (const selectedFacetKey of selectedFacets) {
    // for each selected facet key ie. (languages←python→versions←3.7)
    // split for the last ← key and left is key, right is value
    const splitLet = [...selectedFacetKey];
    let idx = splitLet.length - 1;
    let targetIdx;
    while (!targetIdx && idx > -1) {
      if (splitLet[idx] === '←') {
        targetIdx = idx;
        break;
      }
      idx--;
    }

    filters.push({
      text: {
        query: selectedFacetKey.slice(idx + 1),
        path: `facets.${selectedFacetKey.slice(0, idx)}`,
      },
    });
  }

  return filters;
};

/**
 * Returns the facets required for 'facet' operator
 * within $search aggregation
 * https://www.mongodb.com/docs/atlas/atlas-search/facet/#syntax-1
 *
 */
const getFacets = (selectedFacets: string[], taxonomy: Taxonomy) => {
  const [selectedBaseFacetSet, facetStrings] = getFacetKeysForSelections(selectedFacets, taxonomy);

  // add the base facets from Taxonomy if not already selected
  for (const baseName in taxonomy) {
    if (baseName === 'name' || selectedBaseFacetSet.has(baseName)) continue;
    facetStrings.push(baseName);
  }

  const res: { [key: string]: { type: string; path: string } } = {};
  for (const facetString of facetStrings) {
    res[facetString] = {
      type: 'string',
      path: `facets.${facetString}`,
    };
  }
  return res;
};

/**
 * return a set of base facets of Taxonomy that were used
 * also decompose selected facets to farther drilldown 'facet' keys (strings)
 *
 * ie. selectedFacets = ['target_platforms←manual']
 * returns [['target_platforms'], ['target_platforms←manual→versions']]
 *
 */
const getFacetKeysForSelections = (selectedFacets: string[], taxonomy: Taxonomy): [Set<string>, string[]] => {
  const selectedBaseFacetSet: Set<string> = new Set();
  const facetStrings: string[] = [];

  for (const selectedFacet of selectedFacets) {
    const chars = [...selectedFacet];
    const baseIdx = chars.indexOf('←');
    const baseFacet = chars.slice(0, baseIdx).join('');
    selectedBaseFacetSet.add(baseFacet);

    // gotta add the expansion
    let ref: any = taxonomy[baseFacet],
      startRef = baseIdx + 1;

    for (let idx = baseIdx + 1; idx < chars.length; idx++) {
      const char = chars[idx];
      if (char === '→' || idx === chars.length - 1) {
        const targetName = chars.slice(startRef, idx + 1).join('');
        ref = ref.find((te: any) => te.name === targetName);
      } else if (char === '←') {
        ref = ref[chars.slice(startRef, idx).join('')];
        startRef = idx + 1;
      }
    }

    for (const key in ref) {
      if (key !== 'name') facetStrings.push(`${selectedFacet}→${key}`);
    }
  }

  return [selectedBaseFacetSet, facetStrings];
};
