import { Taxonomy, Facet, FacetNode, TaxonomyEntity } from "./SearchIndex";

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

const recursiveInsertNodes = (facet: Facet, taxonomyEntities: TaxonomyEntity[]) => {    
  for (const node of taxonomyEntities) {
    const facetNode: FacetNode = {
      name: node['name']
    };
    if (node['display_name']) { facetNode.displayName = node['display_name'] as string; }
    for (const property in node) {
      if (property === 'name' || property === 'display_name') {continue; }
      facetNode.facets = facetNode.facets || [];
      const newFacet:Facet = {
        name: property,
        nodes: []
      };
      facetNode.facets.push(newFacet);
      recursiveInsertNodes(newFacet, node[property] as TaxonomyEntity[])
    }
    facet.nodes.push(facetNode)
  }
};

export function convertTaxonomyResponse(taxonomy: Taxonomy): Facet[] {
  const res: Facet[] = [];
  for (const stringKey in taxonomy) {
    if (stringKey === 'name') { continue; }
    const facet: Facet = {
      name: stringKey,
      nodes: []
    };
    recursiveInsertNodes(facet, taxonomy[stringKey]);
    res.push(facet);
  }
  return res;
}