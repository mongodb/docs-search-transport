type mappingKeys = 'mappings' | 'analyzers' | 'synonyms';

export type IndexMappings = { [Key in mappingKeys]?: any };

/**
 * TODO: below are typings for admin API requests
 * to be used with creating POST/PATCH body schema
 */
interface customAnalyzer {
  charFilters?: any[];
  name: string;
  tokenFilters?: any[];
  tokenizer: any;
}

interface synonymMapping {
  name: string;
  analyzer: string;
  source: { collection: string };
}

export interface CreateBodySchema {
  analyzer?: string;
  analyzers?: customAnalyzer[];
  collectionName: string;
  database: string;
  mappings?: IndexMappings;
  name: string;
  searchAnalyzer?: string;
  synonyms?: synonymMapping[];
}

export interface SearchIndexResponse {
  analyzer?: string;
  analyzers?: customAnalyzer[];
  collectionName: string;
  database: string;
  indexID: string;
  mappings?: IndexMappings['mappings'];
  name: string;
  searchAnalyzer?: string;
  status?: string;
  synonyms?: IndexMappings['synonyms'];
}
