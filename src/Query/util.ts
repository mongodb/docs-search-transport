import { Filter } from 'mongodb';

import { Document, FacetAggregationStage, FacetOption, TrieFacet } from '../SearchIndex/types';

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

  // values with same base facet keys should be treated as OR
  const queryParamLists: { [key: string]: Filter<Document> } = {};

  for (const [key, value] of searchParams) {
    // key = 'facets.target_product>atlas>sub_product'
    // value = 'search'
    if (!key.startsWith(FACET_PREFIX)) {
      continue;
    }

    // get base facet name
    const drilldownKeyIdx = key.indexOf('>');
    const baseFacet = drilldownKeyIdx > -1 ? key.slice(0, drilldownKeyIdx) : key;

    queryParamLists[baseFacet] = queryParamLists[key] || {
      compound: {
        should: [],
      },
    };
    queryParamLists[baseFacet]['compound']['should'].push({
      phrase: {
        query: value,
        path: key,
      },
    });
  }

  return Object.values(queryParamLists);
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
      _id: 0,
      title: 1,
      preview: 1,
      url: 1,
      searchProperty: 1,
      facets: {
        $reduce: {
          input: { $objectToArray: '$facets' },
          initialValue: [],
          in: {
            $concatArrays: [
              '$$value',
              {
                $map: {
                  input: '$$this.v',
                  as: 'facetValue',
                  in: {
                    id: '$$facetValue',
                    key: '$$this.k',
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
];
