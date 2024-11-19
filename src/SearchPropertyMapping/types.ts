interface SearchObj {
  categoryName?: string;
  categoryTitle: string;
}

export interface Branches {
  name: string;
  active: boolean;
  versionSelectorLabel: string;
  urlSlug?: string | undefined;
  gitBranchName?: string;
  noIndexing?: boolean;
}

export interface Repo {
  project: string;
  branches: Branches[];
  search: SearchObj | null;
}

interface ProjectSearch {
  [x: string]: {};
}

export type SearchPropertyMapping = Record<string, ProjectSearch>;
