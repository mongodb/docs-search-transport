// MongoDB Documents
export interface Document {
  slug: string;
  strippedSlug?: string;
  title?: string;
  headings?: string[];
  text?: string; // legacy manifests have text instead of paragraphs
  paragraphs?: string; // legacy manifests will not have paragraphs
  code?: {}[]; // legacy manifests will not have code field
  preview?: string;
  tags: null | string[];
}

export interface ManifestDocument extends Document {
  facets?: ManifestFacet[];
}

interface ManifestData {
  documents: ManifestDocument[];
  includeInGlobalSearch: boolean;
  url: string;
}

export interface Manifest {
  manifest: ManifestData;
  lastModified: Date;
  manifestRevisionId: string;
  searchProperty: string;
}

export interface DatabaseDocument extends Document {
  url: string;
  manifestRevisionId: string;
  searchProperty: string[];
  includeInGlobalSearch: boolean;
  facets: DocumentFacet;
}

// Typed response
export interface RefreshInfo {
  deleted: number;
  updated: string[];
  skipped: string[];
  errors: Error[];
  dateStarted: Date;
  dateFinished: Date | null;
  elapsedMS: number | null;
}

// Taxonomy
export interface TaxonomyEntity {
  name: string;
  display_name?: string;
  [x: string]: TaxonomyEntity[] | string | undefined;
}

export type Taxonomy = Record<string, TaxonomyEntity[]>;

// Facets
export type ManifestFacet = {
  category: string;
  value: string;
  sub_facets: ManifestFacet[] | null;
};

export type DocumentFacet = {
  [key: string]: string[];
};

export type FacetDisplayNames = {
  name?: string;
  [key: string]: FacetDisplayNames | string | boolean | undefined;
};

export type FacetBucket = {
  buckets: {
    _id: string;
    count: number;
  }[];
};

export type FacetAggRes = {
  count: {
    lowerBound: number;
  };
  facet: {
    [key: string]: FacetBucket;
    // key is split by '>' key
  };
};
