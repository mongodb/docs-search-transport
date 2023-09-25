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

// TODO: update this to work with new facet structure (children and options)
export function formatFacetMetaResponse(facetAggRes: FacetAggRes, taxonomyTrie: FacetDisplayNames) {
  const res: {
    count: number;
    facets: FacetRes;
  } = {
    count: facetAggRes['count']['lowerBound'],
    facets: {},
  };

  for (const [facetKey, facetBucket] of Object.entries(facetAggRes['facet'])) {
    _constructFacetResponse(res.facets, facetKey, facetBucket, taxonomyTrie);
  }
  // for each facetAggRes
  // split the key into parts
  // and lookup each bucket of aggres
  return res;
}

// generates same response structure as /v2/manifest
// for facet aggregation results
// mutates and formats resultsFacet
function _constructFacetResponse(
  responseFacets: FacetRes,
  facetKey: string,
  facetBucket: FacetBucket,
  taxonomy: FacetDisplayNames
) {
  let responseRef = responseFacets;
  let taxRef = taxonomy;
  try {
    for (const facetName of facetKey.split('>')) {
      const taxEntity = taxRef[facetName] as FacetDisplayNames;
      if (!taxEntity) {
        console.error(`Facet filter does not exist: ${facetKey}`);
        continue;
      }
      responseRef[facetName] = responseRef[facetName] || {
        name: taxEntity['name'],
      };
      responseRef = responseRef[facetName] as FacetRes;
      taxRef = taxRef[facetName] as FacetDisplayNames;
    }

    for (const bucket of facetBucket['buckets']) {
      const childFacet = taxRef[bucket._id] as FacetDisplayNames;
      if (!childFacet) {
        console.error(
          `Error: Facets.bucket:  \n ${JSON.stringify(bucket)} \n` +
            `Does not match taxonomy: \n${JSON.stringify(taxRef)}`
        );
        continue;
      }
      responseRef[bucket._id] = {
        ...Object(responseRef[bucket._id]),
        name: childFacet.name,
        count: bucket.count,
      };
    }
  } catch (e) {
    console.error(`Error while constructing facet response: ${e}`);
    throw new InvalidQuery();
  }
}

/**
 *
 * @param taxonomy    taxonomy representation of all available facets
 * @returns           root list of FacetOption[], representing taxonomy
 */
export function convertTaxonomyResponse(taxonomy: Taxonomy): FacetOption[] {
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
