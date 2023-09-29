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
  facets?: {};
}

interface ManifestData {
  documents: Document[];
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
export type TrieFacet = {
  name: string;
  [key: string]: TrieFacet | string | boolean | undefined;
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

export type FacetOption = {
  type: 'facet-option';
  id: string; // used to verify against taxonomy
  name: string; // used to display for front end
  key: string;
  options: FacetValue[];
};

export type FacetValue = {
  type: 'facet-value';
  id: string;
  name: string;
  key: string;
  count?: number;
  facets: FacetOption[];
};

export type FacetAggregationStage = { [key: string]: { type: 'string'; path: string } };
