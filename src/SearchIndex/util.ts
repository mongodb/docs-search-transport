import assert from 'assert';
import S3 from 'aws-sdk/clients/s3';
// @ts-ignore
import Logger from 'basic-logger';
import crypto from 'crypto';
// @ts-ignore
import dive from 'dive';
import fs from 'fs';
import util from 'util';

import { Manifest, Taxonomy, FacetBucket, FacetDisplayNames, FacetAggRes, FacetOption, FacetValue } from './types';
import { TaxonomyEntity } from '../SearchIndex/types';

import { InvalidQuery } from '../Query';

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

interface FacetRes {
  count?: number;
  name?: string;
  [key: string]: FacetRes | string | number | undefined;
}

export function formatFacetMetaResponse(facetAggRes: FacetAggRes, taxonomyTrie: FacetDisplayNames) {
  const facetRes: FacetRes = {};

  const facets: FacetOption[] = convertToFacetOptions(facetAggRes.facet, taxonomyTrie);

  return {
    count: facetAggRes.count['lowerBound'],
    facets: facets,
  };
}


function handleFacetValue(
  facetOption: FacetOption,
  key: string,
  id: string,
  taxonomyEntity: FacetDisplayNames,
  facetsByFacetKey: { [key: string]: FacetOption | FacetValue }
) {
  facetOption.options.push({
    id: id,
    name: taxonomyEntity.name || convertTitleCase(taxonomyEntity.name || '', id),
    facets: [],
    key: key,
    type: 'facet-value',
  });

  facetsByFacetKey[key] = facetOption.options[facetOption.options.length - 1];
}

function handleFacetOption(
  facetValue: FacetValue,
  key: string,
  id: string,
  taxonomyEntity: FacetDisplayNames,
  facetsByFacetKey: { [key: string]: FacetOption | FacetValue }
) {
  facetValue.facets.push({
    id: id,
    name: taxonomyEntity.name || convertTitleCase(taxonomyEntity.name || '', id),
    options: [],
    key: key,
    type: 'facet-option',
  });

  facetsByFacetKey[key] = facetValue.facets[facetValue.facets.length - 1];
}

function convertToFacetOptions(
  facetsRes: { [key: string]: FacetBucket },
  taxonomyTrie: FacetDisplayNames
): FacetOption[] {
  const res: { facets: FacetOption[] } = {
    facets: [],
  };
  const facetsByFacetKey: { [key: string]: FacetOption | FacetValue } = {};
  const taxonomyByKey: { [key: string]: FacetDisplayNames } = {};
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
      const parentKey = parts.slice(0, partIdx).join('>')
      taxonomyRef = taxonomyRef[part] as FacetDisplayNames;
      if (!taxonomyRef) {
        console.error(`Facet filter does not exist: ${facetKey}`);
        continue;
      } else {
        taxonomyByKey[partialKey] = taxonomyRef;
      }

      // find reference of facet value / facet option
      if (partIdx === 0) {
        facetRef = res as unknown as FacetOption;
      } else {
        facetRef = facetsByFacetKey[parentKey];
      }

      if (partIdx % 2 && !facetsByFacetKey[parentKey]) {
        // handle facet value
        handleFacetValue(facetRef as FacetOption, partialKey, part, taxonomyRef, facetsByFacetKey);
      }
      else if (!facetsByFacetKey[partialKey] && facetsRes[facetKey].buckets.length) {
        handleFacetOption(facetRef as FacetValue, partialKey, part, taxonomyRef, facetsByFacetKey);
      }
    }

    const target = facetsByFacetKey[facetKey] as FacetOption;
    if (target) {
      target.options = [];
    }
    for (const bucket of facetsRes[facetKey].buckets) {
      const foundFacet = taxonomyByKey[facetKey]?.[bucket._id] as FacetDisplayNames;
      const key = facetKey + '>' + bucket._id;
      target.options.push({
        id: bucket._id,
        name: foundFacet.name || '',
        facets: [],
        key: key,
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
export function convertTaxonomyToTrie(taxonomy: Taxonomy): FacetDisplayNames {
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

/**
 *
 * @param taxonomy    taxonomy representation of all available facets
 * @returns           root list of FacetOption[], representing taxonomy
 */
export function convertTaxonomyToResponseFormat(taxonomy: Taxonomy): FacetOption[] {
  const res: FacetOption[] = [];

  function handleFacetOption(taxonomy: Taxonomy, id: string, prefix: string): FacetOption {
    const newFacetOption: FacetOption = {
      type: 'facet-option',
      id: id,
      key: prefix + id,
      name: convertTitleCase(id, id),
      options: [],
    };

    for (const taxonomyFacet of taxonomy[id]) {
      newFacetOption.options.push(handleFacetValue(id, taxonomyFacet, prefix + id));
    }

    return newFacetOption;
  }

  function handleFacetValue(taxonomyKey: string, taxonomyFacet: TaxonomyEntity, prefix: string): FacetValue {
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
        handleFacetOption(taxonomyFacet as unknown as Taxonomy, key, `${prefix}>${taxonomyFacet.name}>`)
      );
    }

    return newFacet;
  }

  for (const facetOptionKey of Object.keys(taxonomy)) {
    res.push(handleFacetOption(taxonomy, facetOptionKey, ''));
  }
  return res;
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
