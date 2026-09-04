interface ProjectSearch {
  [x: string]: {};
}

/**
 * Keyed by search property: `${search.categoryName ?? project}-${versionName}`.
 * Only the keys are consumed, as the allowlist for global search; the values are
 * carried for other consumers of the same payload.
 */
export type SearchPropertyMapping = Record<string, ProjectSearch>;
