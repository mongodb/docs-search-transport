import { MongoClient } from 'mongodb';

import { Branches, Repo, SearchPropertyMapping } from './types';

// Other oldgen sites should have documents in the repos_branches collection as well, even if they're not on snooty yet.
// Special case for mms-docs, which have editions and it's unclear how their document(s) will
// look like in the repos_branches collection.
const oldGenDocs = [
  {
    project: 'cloud',
    branches: [
      {
        name: 'master',
        active: true,
        versionSelectorLabel: 'Latest',
      },
    ],
    search: {
      categoryName: 'mms-cloud',
      categoryTitle: 'Cloud Manager',
    },
  },
  {
    project: 'onprem',
    branches: [
      {
        name: 'master',
        active: true,
        versionSelectorLabel: 'upcoming',
      },
      {
        name: 'v5.0',
        active: true,
        urlSlug: 'current',
        versionSelectorLabel: 'Version 5.0 (current)',
      },
      {
        name: 'v4.4',
        active: true,
        versionSelectorLabel: 'Version 4.4',
      },
    ],
    search: {
      categoryName: 'mms-onprem',
      categoryTitle: 'Ops Manager',
    },
  },
];
const POOL_ATLAS_URI = 'POOL_ATLAS_URI';

function verifyAndGetEnvVars() {
  const poolAtlasUri = process.env[POOL_ATLAS_URI];

  if (!poolAtlasUri) {
    const msg = `Missing ${POOL_ATLAS_URI}`;
    console.error(msg);
    throw new Error(msg);
  }

  return poolAtlasUri;
}

const internals = {
  searchPropertyMapping: {},
};

// Add search properties for each branch of a category.
// A search property is typically in the form of "<category>-<version>"
const addSearchProperties = (
  searchPropertyMapping: SearchPropertyMapping,
  categoryName: string,
  categoryTitle: string,
  branches: Branches[]
) => {
  branches.forEach((branch) => {
    if (!branch.active) {
      return;
    }

    const { urlSlug, name, gitBranchName, versionSelectorLabel } = branch;
    const version = urlSlug || gitBranchName;

    const searchProperty = `${categoryName}-${version}`;

    let versionLabel = versionSelectorLabel;
    // We've typically always labeled non-versioned repos as having the "Latest" version in the search dropdown.
    const hasUnlabeledMainBranch = !versionLabel || versionLabel === 'master';
    if (version === 'master' && hasUnlabeledMainBranch) {
      versionLabel = 'Latest';
    }

    searchPropertyMapping[searchProperty] = {
      categoryTitle,
      versionSelectorLabel: versionLabel,
    };
  });
};

// Look at document of a repo to create search properties for the mapping
const parseRepoForSearchProperties = (searchPropertyMapping: SearchPropertyMapping, repo: Repo) => {
  const categoryName = repo.search?.categoryName ?? repo.project;
  const categoryTitle = repo.search?.categoryTitle ?? '';

  addSearchProperties(searchPropertyMapping, categoryName, categoryTitle, repo.branches);
};

export const setPropertyMapping = async function () {
  const collectionName = 'repos_branches';
  const dbName = process.env['POOL_DB'] ?? 'pool_test';

  const poolAtlasUri = verifyAndGetEnvVars();
  const client = await MongoClient.connect(poolAtlasUri);
  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  const query = {
    search: { $exists: true },
  };
  const searchPropertyMapping = {};

  try {
    // Populate mapping with oldgen docs repos that we might not currently have documents for in the repos_branches collection.
    oldGenDocs.forEach((repo) => {
      parseRepoForSearchProperties(searchPropertyMapping, repo);
    });

    const repos = await collection.find(query).toArray();

    repos.forEach((r) => {
      const repo = {
        project: r.project,
        search: r.search,
        branches: r.branches,
      };
      parseRepoForSearchProperties(searchPropertyMapping, repo);
    });
  } catch (e) {
    console.error(`Error while create search property mapping: ${e}`);
    throw e;
  } finally {
    client.close();
  }

  internals.searchPropertyMapping = searchPropertyMapping;
  return searchPropertyMapping;
};

export const getPropertyMapping = () => {
  return internals['searchPropertyMapping'];
};
