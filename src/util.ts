import { InvalidQuery } from './Query';
import { Taxonomy, TaxonomyEntity, FacetDisplayNames, FacetBucket, FacetAggRes } from './SearchIndex';

export function arrayEquals<T>(arr1: Array<T>, arr2: Array<T>): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i += 1) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
}

export function isPermittedOrigin(url: URL): boolean {
  return url.protocol == 'https:' && arrayEquals(url.hostname.split('.').slice(-2), ['mongodb', 'com']);
}

function convertTitleCase(name: string, property: string): string {
  const UNCHANGED_PROPS = ['versions'];
  if (UNCHANGED_PROPS.indexOf(property) > -1) {
    return name;
  }
  return name.replace(/^[_-]*(.)|[_-]+(.)/g, (s, c, d) => (c ? c.toUpperCase() : ' ' + d.toUpperCase()));
}

/**
 *
 * @param taxonomy
 * @returns a trie structure of taxonomy.
 * each node is denoted by a 'name' attribute.
 * other attributes denotes a new node
 * ['name' and 'display_name' attributes denote name(s) of facet]
 * [versions have special boolean attribute of 'stable']
 */
export function convertTaxonomyResponse(taxonomy: Taxonomy): FacetDisplayNames {
  const res: FacetDisplayNames = {};

  function addToRes(entityList: TaxonomyEntity[], ref: { [key: string]: any }, property: string) {
    ref[property] = {
      name: convertTitleCase(property, property), // convert snakecase to title case
    };
    ref = ref[property];
    for (const taxEntity of entityList) {
      const entity: Record<string, any> = {
        name: taxEntity['display_name'] || convertTitleCase(taxEntity['name'], property),
      };
      if (property === 'versions' && taxEntity['stable']) {
        entity['stable'] = true;
      }
      for (const key in taxEntity) {
        if (!Array.isArray(taxEntity[key])) {
          continue;
        }
        addToRes(taxEntity[key] as TaxonomyEntity[], entity, key);
      }
      ref[taxEntity['name']] = entity;
    }
  }

  for (const stringKey in taxonomy) {
    if (stringKey === 'name') {
      continue;
    }
    addToRes(taxonomy[stringKey], res as object, stringKey);
  }
  return res;
}

interface FacetRes {
  count?: number;
  name?: string;
  [key: string]: FacetRes | string | number | undefined;
}

export function formatFacetMetaResponse(facetAggRes: FacetAggRes, taxonomyTrie: FacetDisplayNames) {
  const res: {
    count: number;
    facets: FacetRes;
  } = {
    count: facetAggRes['count']['lowerBound'],
    facets: {},
  };

  for (const [facetKey, facetBucket] of Object.entries(facetAggRes['facet'])) {
    _constructFacetResponse(res.facets, facetKey, facetBucket, taxonomyTrie);
  }
  // for each facetAggRes
  // split the key into parts
  // and lookup each bucket of aggres
  return res;
}

// generates same response structure as /v2/manifest
// for facet aggregation results
// mutates and formats resultsFacet
function _constructFacetResponse(
  responseFacets: FacetRes,
  facetKey: string,
  facetBucket: FacetBucket,
  taxonomy: FacetDisplayNames
) {
  let responseRef = responseFacets;
  let taxRef = taxonomy;
  try {
    for (const facetName of facetKey.split('>')) {
      const taxEntity = taxRef[facetName] as FacetDisplayNames;
      responseRef[facetName] = responseRef[facetName] || {
        name: taxEntity['name'],
      };
      responseRef = responseRef[facetName] as FacetRes;
      taxRef = taxRef[facetName] as FacetDisplayNames;
    }

    for (const bucket of facetBucket['buckets']) {
      const childFacet = taxRef[bucket._id] as FacetDisplayNames;
      responseRef[bucket._id] = {
        ...Object(responseRef[bucket._id]),
        name: childFacet.name,
        count: bucket.count,
      };
    }
  } catch (e) {
    console.error(`Error while constructing facet response: ${e}`);
    throw new InvalidQuery();
  }
}
