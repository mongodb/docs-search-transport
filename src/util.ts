import { Taxonomy, TaxonomyEntity, FacetDisplayNames } from "./SearchIndex";

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

function convertTitleCase(name: string): string {
  return name.replace(/^[_-]*(.)|[_-]+(.)/g, (s, c, d) => c ? c.toUpperCase() : ' ' + d.toUpperCase())
}

export function convertTaxonomyResponse(taxonomy: Taxonomy): FacetDisplayNames {
  const res: FacetDisplayNames = {};
  // taxonomy = {
    //   target_platforms: [{
      //     name: 'mongocli',
      //     versions: [{
        //       name: 'v1.0'
        //     }]
        //   }]
        // }
        
  function addToRes(entityList: TaxonomyEntity[], property?: string) {
    // if this is a version, leave it alone, no conversion
    const conversion = property === 'versions' ? (s: string) => (s) : convertTitleCase;
    for (const entity of entityList) {
      res[entity['name']] = entity['display_name'] || conversion(entity['name'])
      for (const entityProperty in entity) {
        const children = entity[entityProperty];
        if (typeof children !== 'string' && children !== undefined) {
          addToRes(entity[entityProperty] as TaxonomyEntity[], entityProperty)
        }
      }
    }
  }

  for (const stringKey in taxonomy) {
    if (stringKey === 'name') { continue; }
    res[stringKey] = convertTitleCase(stringKey);// convert snakecase to title case
    addToRes(taxonomy[stringKey], stringKey)
  }
  return res;
}