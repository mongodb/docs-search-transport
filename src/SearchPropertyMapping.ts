import { MongoClient } from 'mongodb';

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
    console.error(`Missing ${POOL_ATLAS_URI}`);
    process.exit(1);
  }

  return poolAtlasUri;
}

interface SearchObj {
  categoryName?: string;
  categoryTitle: string;
}

interface Branches {
  name: string;
  active: boolean;
  versionSelectorLabel: string;
  urlSlug?: string | undefined;
  gitBranchName?: string;
}

interface Repo {
  project: string;
  branches: Branches[];
  search: SearchObj | null;
}

interface ProjectSearch {
  // projectToSearchMap?:  Record<string, string>;
  // [x: string]: Record<string, string> | string | undefined;
  [x: string]: {};
}

const internals = {
  searchPropertyMapping: {},
};

export type SearchPropertyMapping = Record<string, ProjectSearch>;

// Add search properties for each branch of a category.
// A search property is typically in the form of "<category>-<version>"
const addSearchProperties = (
  searchPropertyMapping: SearchPropertyMapping,
  categoryName: string,
  categoryTitle: string,
  branches: Branches[]
) => {
  if (!branches) {
    return;
  }

  branches.forEach((branch) => {
    if (!branch.active) {
      return;
    }

    const { urlSlug, name, gitBranchName, versionSelectorLabel } = branch;
    const version = urlSlug || gitBranchName || name;

    const searchProperty: string = `${categoryName}-${version}`;

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
  let categoryName = repo.project;
  let categoryTitle = '';

  if (repo.search) {
    categoryTitle = repo.search.categoryTitle;

    /**
     * This mapping property is used for projects where the project name
     * does not equal the search manifest name
     */
    if (repo.search.categoryName) {
      searchPropertyMapping.projectToSearchMap[repo.project.toString()] = repo.search.categoryName;
      categoryName = repo.search.categoryName;
    }
  }

  addSearchProperties(searchPropertyMapping, categoryName, categoryTitle, repo.branches);
};

export const setPropertyMapping = async function (env: string) {
  let dbName;
  const collectionName = 'repos_branches';

  switch (env) {
    case 'production':
      dbName = 'pool';
      break;
    case 'staging':
      dbName = 'pool_test';
      break;
    default:
      dbName = 'pool';
  }

  const poolAtlasUri = verifyAndGetEnvVars();
  const client = await MongoClient.connect(poolAtlasUri);
  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  const query = {
    search: { $exists: true },
  };
  const searchPropertyMapping = {
    projectToSearchMap: {},
  };

  try {
    // Populate mapping with oldgen docs repos that we might not currently have documents for in the repos_branches collection.
    oldGenDocs.forEach((repo) => {
      parseRepoForSearchProperties(searchPropertyMapping, repo);
    });

    await collection
      .find(query)
      .toArray()
      .then((repos) => {
        repos.forEach((r) => {
          const repo = {
            project: r.project,
            search: !r.search
              ? null
              : {
                  categoryTitle: r.search.categoryTitle,
                  categoryName: r.search.categoryName ? r.search.categoryName : null,
                },
            branches: r.branches,
          };
          parseRepoForSearchProperties(searchPropertyMapping, repo);
        });
      });

    console.log('the search property is ', searchPropertyMapping);
  } catch (e) {
    console.error(`Error while create search property mapping: ${e}`);
  } finally {
    client.close();
  }

  internals.searchPropertyMapping = searchPropertyMapping;
  return searchPropertyMapping;
};

export const getPropertyMapping = () => {
  return internals['searchPropertyMapping'];
};
