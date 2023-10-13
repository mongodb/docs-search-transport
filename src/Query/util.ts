import { Filter } from 'mongodb';

import { Document, FacetAggregationStage, FacetOption } from '../SearchIndex/types';

const atomicPhraseMap: Record<string, string> = {
  ops: 'manager',
  cloud: 'manager',
  real: 'time',
};

export function tokenize(text: string, fuzzy: boolean): string[] {
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

export const extractFacetFilters = (searchParams: URL['searchParams']): Filter<Document>[] => {
  // query should be in form of:
  // q=test&facets.target_product>manual>versions=v6.0&facets.target_product=atlas
  // where each query param starting with 'facets.' denotes a filter
  const FACET_PREFIX = 'facets.';
  const filters: Filter<Document>[] = [];
  for (const [key, value] of searchParams) {
    if (!key.startsWith(FACET_PREFIX)) {
      continue;
    }

    filters.push({
      phrase: {
        query: value,
        path: key,
      },
    });
  }
  return filters;
};

export const getFacetAggregationStages = (taxonomy: FacetOption[]) => {
  const facetKeysForAgg: FacetAggregationStage = {};

  function getKeysFromFacetOptions(facetOptions: FacetOption[]) {
    for (const facetOption of facetOptions) {
      facetKeysForAgg[facetOption.key] = {
        type: 'string',
        path: `facets.${facetOption.key}`,
      };
      for (const facetValue of facetOption.options) {
        if (facetValue.facets?.length) {
          getKeysFromFacetOptions(facetValue.facets);
        }
      }
    }
  }

  getKeysFromFacetOptions(taxonomy);
  return facetKeysForAgg;
};

export const getProjectionAndFormatStages = (): Filter<Document>[] => [
  {
    $project: {
      _id: 1,
      title: 1,
      preview: 1,
      url: 1,
      searchProperty: 1,
      facets: {
        // facets are originally stored as {facets: { string: string[] }}
        // this converts to {facets: [k: string, v: string[]]}
        $objectToArray: '$facets',
      },
    },
  },
  {
    // unwinds each {facets: [k: string, v: string[]]} to its own document
    // so it becomes { facets: {k: string, v: string[] } }
    $unwind: {
      path: '$facets',
      preserveNullAndEmptyArrays: true
    },
  },
  {
    $project: {
      // project key and values to its own document
      // so we can unwind values
      key: '$facets.k',
      values: {
        $map: {
          input: '$facets.v',
          as: 'value',
          in: {
            id: '$$value',
          },
        },
      },
      _id: 1,
      title: 1,
      preview: 1,
      url: 1,
      searchProperty: 1,
    },
  },
  {
    // unwind all nested values
    $unwind: {
      path: '$values',
      preserveNullAndEmptyArrays: true
    },
  },
  {
    // group all unnested values and keys back
    $group: {
      _id: '$_id',
      title: {
        $first: '$title',
      },
      preview: {
        $first: '$preview',
      },
      url: {
        $first: '$url',
      },
      searchProperty: {
        $first: '$searchProperty',
      },
      facets: {
        $push: {
          key: '$key',
          id: '$values.id',
        },
      },
    },
  },
  {
    $project: {
      _id: 0,
    },
  },
];
