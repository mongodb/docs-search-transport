import { Filter } from 'mongodb';

import { Document, FacetDisplayNames } from '../SearchIndex/types';

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

// TODO: update this to use with new children attribute taxonomy
export const getFacetsForMeta = (filter: Filter<Document>, taxonomy: FacetDisplayNames) => {
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
