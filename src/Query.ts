'use strict';

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
        path: 'text',
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
        ? { searchProperty: searchProperty }
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
            path: ['text', 'headings', 'title'],
          },
        };
      });
    }

    return [
      {
        $search: {
          compound,
        },
      },
      { $match: { $expr: filter } },
    ];
  }
}
