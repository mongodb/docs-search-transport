import { Filter } from 'mongodb';

import { Document, FacetAggregationStage, FacetOption } from '../SearchIndex/types';

import { Phrase } from './types';

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
    console.log('\n\n\n---------------------------------');
    console.log('key', key);
    console.log('value', value);
    if (!key.startsWith(FACET_PREFIX)) {
      continue;
    }

    // get base facet name
    const drilldownKeyIdx = key.indexOf('>');
    const baseFacet = drilldownKeyIdx > -1 ? key.slice(0, drilldownKeyIdx) : key;

    console.log('BASE FACET', baseFacet);
    // if it's a facet that's a subproduct
    // we want to get rid of parent product if it exists

    console.log('KEY', key);

    console.log('QUERY PARAM LISTS', JSON.stringify(queryParamLists, null, 2));
    console.log('QUEWRY PARAM LISTS AT BASEFACET', JSON.stringify(queryParamLists[baseFacet], null, 2));
    queryParamLists[baseFacet] = queryParamLists[baseFacet] || {
      compound: {
        should: [],
      },
    };
    console.log('QUERY PARAM LISTS3', JSON.stringify(queryParamLists, null, 2));
    // if subproduct, remove parent
    if (drilldownKeyIdx > -1) {
      // retrieve parent product from key
      const parent = key.slice(drilldownKeyIdx + 1, key.indexOf('>', drilldownKeyIdx + 1));
      console.log('PARENT VALUE', parent);
      const indexOfParent = queryParamLists[baseFacet].compound.should.findIndex(
        (element: Phrase) => element.phrase.query === parent
      );
      console.log('INDEX OF PARENT', indexOfParent);
      if (indexOfParent > -1) queryParamLists[baseFacet].compound.should.splice(indexOfParent, 1);
    }
    console.log('QUERY PARAM LISTS4', JSON.stringify(queryParamLists, null, 2));

    queryParamLists[baseFacet]['compound']['should'].push({
      phrase: {
        query: value,
        path: key,
      },
    });
    console.log('QUERY PARAM LISTS5', JSON.stringify(queryParamLists, null, 2));
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
