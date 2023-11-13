import assert from 'assert';
import S3 from 'aws-sdk/clients/s3';
// @ts-ignore
import Logger from 'basic-logger';
import crypto from 'crypto';
// @ts-ignore
import dive from 'dive';
import fs from 'fs';
import util from 'util';

import {
  Manifest,
  Taxonomy,
  FacetBucket,
  TrieFacet,
  FacetAggRes,
  FacetOption,
  FacetValue,
  AmbiguousFacet,
} from './types';
import { TaxonomyEntity } from '../SearchIndex/types';

// This order is representative of how options are expected to be ordered in the UI
const OPTIONS_SORT_ORDER = ['target_product', 'sub_product', 'version', 'programming_language', 'genre'];

const log = new Logger({
  showTimestamp: true,
});

function convertTitleCase(name: string, property: string): string {
  const UNCHANGED_PROPS = ['versions'];
  if (UNCHANGED_PROPS.indexOf(property) > -1) {
    return name;
  }
  return name.replace(/^[_-]*(.)|[_-]+(.)/g, (s, c, d) => (c ? c.toUpperCase() : ' ' + d.toUpperCase()));
}

export function formatFacetMetaResponse(facetAggRes: FacetAggRes, taxonomyTrie: TrieFacet) {
  const facets: FacetOption[] = convertToFacetOptions(facetAggRes.facet, taxonomyTrie);

  return {
    count: facetAggRes.count['lowerBound'],
    facets: facets,
  };
}

function handleFacetOption(
  facetOption: FacetOption,
  key: string,
  id: string,
  trieFacet: TrieFacet,
  facetsByFacetKey: { [key: string]: FacetOption | FacetValue }
) {
  facetOption.options.push({
    id: id,
    name: trieFacet.name,
    facets: [],
    key: key,
    type: 'facet-value',
  });

  facetsByFacetKey[key] = facetOption.options[facetOption.options.length - 1];
}

function handleFacetValue(
  facetValue: FacetValue,
  key: string,
  id: string,
  trieFacet: TrieFacet,
  facetsByFacetKey: { [key: string]: FacetOption | FacetValue }
) {
  facetValue.facets.push({
    id: id,
    name: trieFacet.name,
    options: [],
    key: key,
    type: 'facet-option',
  });

  facetsByFacetKey[key] = facetValue.facets[facetValue.facets.length - 1];
}

function convertToFacetOptions(facetsRes: { [key: string]: FacetBucket }, taxonomyTrie: TrieFacet): FacetOption[] {
  const res: { facets: FacetOption[] } = {
    facets: [],
  };
  const facetsByFacetKey: { [key: string]: FacetOption | FacetValue } = {};
  const taxonomyByKey: { [key: string]: TrieFacet } = {};
  // keep index of partial taxonomy buckets as we add to res
  // so we don't have to keep searching.
  // length of number[] should correlate to length of '>' in key
  const facetKeys = Object.keys(facetsRes).sort();

  for (const facetKey of facetKeys) {
    const parts = facetKey.split('>');
    let partialKey = '';
    let taxonomyRef = taxonomyTrie;
    let facetRef: FacetOption | FacetValue;

    for (let partIdx = 0; partIdx < parts.length; partIdx++) {
      const part = parts[partIdx];
      partialKey = `${partialKey ? partialKey + '>' : ''}${part}`;
      const parentKey = parts.slice(0, partIdx).join('>');
      taxonomyRef = taxonomyRef[part] as TrieFacet;
      if (!taxonomyRef) {
        console.error(`Facet filter does not exist: ${facetKey}`);
        continue;
      } else {
        taxonomyByKey[partialKey] = taxonomyRef;
      }

      // find reference of facet value / facet option
      if (partIdx === 0) {
        facetRef = res as unknown as FacetValue;
      } else {
        facetRef = facetsByFacetKey[parentKey];
      }

      // keys are sorted. if no reference facet, assume there is no results
      // in parent bucket.
      if (!facetRef) {
        continue;
      }

      if (partIdx % 2 && !facetsByFacetKey[parentKey]) {
        // handle facet value
        handleFacetOption(facetRef as FacetOption, partialKey, part, taxonomyRef, facetsByFacetKey);
      } else if (!facetsByFacetKey[partialKey] && facetsRes[facetKey]?.buckets?.length) {
        handleFacetValue(facetRef as FacetValue, partialKey, part, taxonomyRef, facetsByFacetKey);
      }
    }

    const target = facetsByFacetKey[facetKey] as FacetOption;
    if (target) {
      target.options = [];
    }
    for (const bucket of facetsRes[facetKey].buckets) {
      const foundFacet = taxonomyByKey[facetKey]?.[bucket._id] as TrieFacet;
      const key = facetKey + '>' + bucket._id;
      target.options.push({
        id: bucket._id,
        name: foundFacet.name || '',
        facets: [],
        key: facetKey,
        type: 'facet-value',
        count: bucket.count,
      });

      facetsByFacetKey[key] = target.options[target.options.length - 1];
    }
  }

  return res.facets;
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
export function convertTaxonomyToTrie(taxonomy: Taxonomy): TrieFacet {
  const res: TrieFacet = {
    name: '',
  };

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

function getLastKeyPart(key: string) {
  const parts = key.split('>');
  return parts[parts.length - 1];
}

/**
 * Comparison function that sorts same-level facets based on the following properties:
 * 1) Facet keys organized by categories/options in the order desired for the UI
 * 2) Alphabetical name order
 * Facets with nested keys will be sorted based on their immediate parent's key
 * (i.e. the rightmost part after the last '>')
 * @param a
 * @param b
 */
export function compareFacets(a: AmbiguousFacet, b: AmbiguousFacet): number {
  const optionA = getLastKeyPart(a.key);
  const optionB = getLastKeyPart(b.key);
  const indexOfA = OPTIONS_SORT_ORDER.indexOf(optionA);
  const indexOfB = OPTIONS_SORT_ORDER.indexOf(optionB);
  const aUndefined = indexOfA === -1;
  const bUndefined = indexOfB === -1;

  // Options that are defined should be first, followed by any undefined options
  if (aUndefined && bUndefined) {
    // Undefined options will be sorted alphabetically by default
    return optionA.localeCompare(optionB);
  } else if (bUndefined) {
    return -1;
  } else if (aUndefined) {
    return 1;
  }

  // Should be negative if indexOfA is less than indexOfB, meaning facet option
  // "a" should precede option "b"
  const res = indexOfA - indexOfB;
  if (res === 0) {
    // Alphabetical order may be negligible for parent facets, but not for nested facets
    return a.name.localeCompare(b.name);
  }

  return res;
}

/**
 * Orders facets at every level from options to values.
 * @param facets
 */
export function sortFacets(facets: FacetOption[]): FacetOption[] {
  function getVersionNumber(version: string) {
    const stringNumber = version.replace(/[^0-9\.]+/g, '');
    try {
      const num = parseFloat(stringNumber);
      if (isNaN(num)) {
        return undefined;
      }
      return num;
    } catch {
      return undefined;
    }
  }

  function compareVersions(a: string, b: string) {
    const versionA = getVersionNumber(a);
    const versionB = getVersionNumber(b);
    if (versionA && versionB) {
      // We want versions in descending order, where higher number is first
      return versionB - versionA;
    }

    const specialOrder = ['upcoming', 'latest', 'stable', 'current'];
    const processedA = a.toLowerCase();
    const processedB = b.toLowerCase();

    const indexOfA = specialOrder.indexOf(processedA);
    const indexOfB = specialOrder.indexOf(processedB);
    const aUndefined = indexOfA === -1;
    const bUndefined = indexOfB === -1;

    // Unexpected non-numerical versions will be at the bottom of the list
    if (aUndefined && bUndefined) {
      return a.localeCompare(b);
    } else if (bUndefined) {
      return -1;
    } else if (aUndefined) {
      return 1;
    }

    // Non-numerical versions should follow the special order
    return indexOfA - indexOfB;
  }

  function compareFacetValues(a: FacetValue, b: FacetValue): number {
    if (a.key.endsWith('versions') && b.key.endsWith('versions')) {
      return compareVersions(a.name, b.name);
    }
    // Default to sorting alphabetically unless specified
    return a.name.localeCompare(b.name);
  }

  function sortValues(facetValues: FacetValue[]) {
    facetValues.sort(compareFacetValues);
    facetValues.forEach((facetValue) => {
      sortOptions(facetValue.facets);
    });
  }

  function sortOptions(facetOptions: FacetOption[]) {
    facetOptions.sort(compareFacets);
    facetOptions.forEach((facetOption) => {
      sortValues(facetOption.options);
    });
  }

  sortOptions(facets);
  return facets;
}

/**
 * Returns the name of the facet based on the trie facet structure of the taxonomy.
 * The name will default to the facet id if the facet cannot be determined from the trie.
 */
function getNameFromTrieFacet(trieFacets: TrieFacet, key: string, id: string): string {
  const parts = key.split('>');
  parts.push(id);
  let currentFacet = trieFacets;

  // Traverse through parts of the key until it reaches the target facet
  for (const part of parts) {
    if (typeof currentFacet[part] === 'object') {
      currentFacet = currentFacet[part] as TrieFacet;
    } else {
      // Either the key's structure is wrong, or the trie does not have the same key structure
      return id;
    }
  }

  return currentFacet.name;
}

/**
 * Reorders keys in the facets object. This assumes that all keys are strings that
 * are ordered in insertion order.
 * @param originalFacets
 * @returns A new object for facets, with keys reordered based on intended UI.
 */
export function sortFacetsObject(originalFacets: Record<string, string[]>, trieFacets: TrieFacet) {
  const enumeratedFacets = Object.entries(originalFacets);
  // Temporarily restructure facets object to array form to facilitate sorting
  const separateFacetsList: AmbiguousFacet[] = [];
  enumeratedFacets.forEach(([key, val]) => {
    // Reshapes facets under the same key to be separate objects for sorting.
    // Example: {genre: ['reference', 'tutorial']} => [{key: 'genre', id: 'reference'}, {key: 'genre', id: 'tutorial'}]
    val.forEach((id) => {
      // Empty name for now
      separateFacetsList.push({ id, key, name: getNameFromTrieFacet(trieFacets, key, id) });
    });
  });

  separateFacetsList.sort(compareFacets);
  // Re-convert from array back to object
  const newFacetsObject: Record<string, string[]> = separateFacetsList.reduce(
    (acc: Record<string, string[]>, { key, id }) => {
      if (!acc[key]) {
        acc[key] = [];
      }
      // Should maintain insertion order of facets array under the same key
      acc[key].push(id);
      return acc;
    },
    {}
  );

  return newFacetsObject;
}

/**
 *
 * @param taxonomy    taxonomy representation of all available facets
 * @returns           root list of FacetOption[], representing taxonomy
 */
export function convertTaxonomyToResponseFormat(taxonomy: Taxonomy): FacetOption[] {
  const res: FacetOption[] = [];

  function constructFacetOption(taxonomy: Taxonomy, id: string, prefix: string): FacetOption {
    const newFacetOption: FacetOption = {
      type: 'facet-option',
      id: id,
      key: prefix + id,
      name: convertTitleCase(id, id),
      options: [],
    };

    for (const taxonomyFacet of taxonomy[id]) {
      newFacetOption.options.push(constructFacetValue(id, taxonomyFacet, prefix + id));
    }

    return newFacetOption;
  }

  function constructFacetValue(taxonomyKey: string, taxonomyFacet: TaxonomyEntity, prefix: string): FacetValue {
    const newFacet: FacetValue = {
      type: 'facet-value',
      id: taxonomyFacet.name,
      key: prefix,
      name: taxonomyFacet.display_name || convertTitleCase(taxonomyFacet.name, taxonomyKey),
      facets: [],
    };

    for (const key of Object.keys(taxonomyFacet)) {
      if (!Array.isArray(taxonomyFacet[key])) continue;
      newFacet.facets.push(
        constructFacetOption(taxonomyFacet as unknown as Taxonomy, key, `${prefix}>${taxonomyFacet.name}>`)
      );
    }

    return newFacet;
  }

  for (const facetOptionKey of Object.keys(taxonomy)) {
    res.push(constructFacetOption(taxonomy, facetOptionKey, ''));
  }

  return sortFacets(res);
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/*$/, '/') + path.replace(/^\/*/, '');
}

function generateHash(data: string): Promise<string> {
  const hash = crypto.createHash('sha256');

  return new Promise((resolve, reject) => {
    hash.on('readable', () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString('hex'));
      }
    });

    hash.write(data);
    hash.end();
  });
}

async function getManifestsFromS3(bucketName: string, prefix: string): Promise<Manifest[]> {
  const s3 = new S3({ apiVersion: '2006-03-01' });
  const result: S3.Types.ListObjectsV2Output = await util.promisify(
    s3.makeUnauthenticatedRequest.bind(s3, 'listObjectsV2', {
      Bucket: bucketName,
      Prefix: prefix.replace(/^\//, ''),
    })
  )();

  if (result.IsTruncated) {
    // This would indicate something awry, since we shouldn't
    // ever have more than 1000 properties. And if we ever did,
    // everything would need to be rearchitected.
    throw new Error('Got truncated response from S3');
  }

  const manifests = [];
  for (const bucketEntry of result.Contents || []) {
    if (bucketEntry.Size === 0) {
      log.error(new Error(`Got empty file: "${bucketEntry.Key}"`));
      continue;
    }

    assert.ok(bucketEntry.Key);

    const matches = bucketEntry.Key.match(/([^/]+).json$/);
    if (matches === null) {
      log.error(new Error(`Got weird filename in manifest listing: "${bucketEntry.Key}"`));
      continue;
    }

    const searchProperty = matches[1];
    const data: S3.Types.GetObjectOutput = await util.promisify(
      s3.makeUnauthenticatedRequest.bind(s3, 'getObject', {
        Bucket: bucketName,
        Key: bucketEntry.Key,
      })
    )();

    assert.ok(data.Body);
    assert.ok(data.LastModified);

    const body = data.Body.toString('utf-8');
    const hash = await generateHash(body);
    const parsed = JSON.parse(body);
    manifests.push({
      manifest: parsed,
      lastModified: data.LastModified,
      manifestRevisionId: hash,
      searchProperty: searchProperty,
    });
  }

  return manifests;
}

function getManifestsFromDirectory(prefix: string): Promise<Manifest[]> {
  return new Promise((resolve, reject) => {
    const manifests: Manifest[] = [];

    dive(
      prefix,
      async (err: Error | null, path: string, stats: fs.Stats) => {
        if (err) {
          reject(err);
        }
        const matches = path.match(/([^/]+).json$/);
        if (!matches) {
          return;
        }
        const searchProperty = matches[1];
        const data = fs.readFileSync(path, { encoding: 'utf-8' });
        const parsed = JSON.parse(data);
        const hash = await generateHash(data);

        manifests.push({
          manifest: parsed,
          lastModified: stats.mtime,
          manifestRevisionId: hash,
          searchProperty: searchProperty,
        });
      },
      () => {
        resolve(manifests);
      }
    );
  });
}

/// Fetch manifests from a given path. It can (for historic cruft reasons)
/// take one of two formats:
/// dir:<path> to load manifests from a local directory.
/// s3://<bucketName>/<prefix> to load manifests from an S3 location.
export async function getManifests(manifestSource: string): Promise<Manifest[]> {
  log.info(`Loading manifests from ${manifestSource}`);
  const parsed = new URL(manifestSource);

  let manifests;
  if (parsed.protocol === 's3:') {
    const bucketName = parsed.host.trim();
    const prefix = parsed.pathname.trim();
    if (!bucketName.length || !prefix.length) {
      throw new Error('Bad bucket manifest source');
    }
    manifests = await getManifestsFromS3(bucketName, prefix);
  } else if (parsed.protocol === 'dir:') {
    manifests = await getManifestsFromDirectory(parsed.pathname);
  } else {
    throw new Error('Unknown manifest source protocol');
  }

  // We have a persistent problem with weird URLs. Remove excess leading slashes.
  for (const manifest of manifests) {
    const urlRoot = new URL(manifest.manifest.url);
    urlRoot.pathname = urlRoot.pathname.replace(/^\/+/, '');
    manifest.manifest.url = urlRoot.toString();
  }

  return manifests;
}
