#!/usr/bin/env ts-node
'use strict';

import * as dotenv from 'dotenv';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

// @ts-ignore
import Logger from 'basic-logger';
import { MongoClient } from 'mongodb';

import { AtlasAdminManager } from './AtlasAdmin';
import Marian from './Marian';
import { SearchIndex } from './SearchIndex';

process.title = 'search-transport';

const MANIFEST_URI_KEY = 'MANIFEST_URI';

const S3_BUCKET_KEY = 'S3_BUCKET';
const S3_PATH_KEY = 'S3_PATH';
const ATLAS_URI_KEY = 'ATLAS_URI';
const DATABASE_NAME_KEY = 'ATLAS_DATABASE';
const DEFAULT_DATABASE_NAME = 'search';
const GROUP_KEY = 'GROUP_ID';
const ADMIN_API_KEY = 'ATLAS_ADMIN_API_KEY';
const ADMIN_PUB_KEY = 'ATLAS_ADMIN_PUB_KEY';
const TAXONOMY_URL = 'TAXONOMY_URL';

function help(): void {
  console.error(`Usage: search-transport [--create-indexes] [--load-manifests]

The following environment variables are used:
* ${MANIFEST_URI_KEY}
* ${S3_BUCKET_KEY}
* ${S3_PATH_KEY}
* ${ATLAS_URI_KEY}
* ${DATABASE_NAME_KEY} (defaults to "search")
* ${GROUP_KEY}
* ${ADMIN_API_KEY}
* ${ADMIN_PUB_KEY}
* ${TAXONOMY_URL}
`);
}

function verifyAndGetEnvVars() {
  const manifestUri = process.env[MANIFEST_URI_KEY];
  const s3Bucket = process.env[S3_BUCKET_KEY];
  const s3Path = process.env[S3_PATH_KEY];
  const atlasUri = process.env[ATLAS_URI_KEY];
  const groupId = process.env[GROUP_KEY];
  const adminPubKey = process.env[ADMIN_PUB_KEY];
  const adminPrivKey = process.env[ADMIN_API_KEY];
  const taxonomyUrl = process.env[TAXONOMY_URL];

  if (!manifestUri || !s3Bucket || !atlasUri || !groupId || !adminPrivKey || !adminPubKey || !s3Path) {
    if (!manifestUri) {
      console.error(`Missing ${MANIFEST_URI_KEY}`);
    }
    if (!s3Bucket) {
      console.error(`Missing ${S3_BUCKET_KEY}`);
    }
    if (!s3Path) {
      console.error(`Missing ${S3_PATH_KEY}`);
    }
    if (!atlasUri) {
      console.error(`Missing ${ATLAS_URI_KEY}`);
    }
    if (!groupId) {
      console.error(`Missing ${GROUP_KEY}`);
    }
    if (!adminPrivKey) {
      console.error(`Missing ${ADMIN_API_KEY}`);
    }
    if (!adminPubKey) {
      console.error(`Missing ${ADMIN_PUB_KEY}`);
    }
    if (!taxonomyUrl) {
      console.error(`Missing ${TAXONOMY_URL}`);
    }
    help();
    process.exit(1);
  }

  return {
    manifestUri,
    s3Bucket,
    s3Path,
    atlasUri,
    groupId,
    adminPubKey,
    adminPrivKey,
  };
}

async function main() {
  Logger.setLevel('info', true);

  if (
    process.argv.length < 2 ||
    process.argv.length > 4 ||
    process.argv.includes('--help') ||
    process.argv.includes('-h')
  ) {
    help();
    process.exit(1);
  }

  const { manifestUri, s3Bucket, s3Path, atlasUri, groupId, adminPubKey, adminPrivKey } = verifyAndGetEnvVars();

  let databaseName = DEFAULT_DATABASE_NAME;
  const envDBName = process.env[DATABASE_NAME_KEY];
  if (envDBName) {
    databaseName = envDBName;
  }

  const client = await MongoClient.connect(atlasUri);
  const searchIndex = new SearchIndex(manifestUri, s3Bucket, s3Path, client, databaseName);

  if (process.argv.includes('--create-indexes')) {
    await searchIndex.createRecommendedIndexes();
  }

  const atlasAdmin = new AtlasAdminManager(adminPubKey, adminPrivKey, groupId, client);
  const server = new Marian(searchIndex, atlasAdmin);

  try {
    await server.load(process.argv.includes('--load-manifests'));
  } catch (e) {
    console.error(`Error while initializing server: ${JSON.stringify(e)}`);
    throw e;
  }
  server.start(8080);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
