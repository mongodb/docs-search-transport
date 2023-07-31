import { Taxonomy, TaxonomyEntity, FacetDisplayNames } from './SearchIndex';

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
