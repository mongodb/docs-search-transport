import { SearchPropertyMapping } from './types';

const SEARCH_MAPPING_URL = 'SEARCH_MAPPING_URL';

function verifyAndGetEnvVars() {
  const searchMappingUrl = process.env[SEARCH_MAPPING_URL];

  if (!searchMappingUrl) {
    const msg = `Missing ${SEARCH_MAPPING_URL}`;
    console.error(msg);
    throw new Error(msg);
  }

  return searchMappingUrl;
}

const internals = {
  searchPropertyMapping: {},
};

/**
 * Rejects a payload that would leave us with no search properties.
 */
const assertUsableMapping = (payload: unknown): SearchPropertyMapping => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Search mapping response was not an object');
  }

  const mapping = payload as SearchPropertyMapping;
  if (!Object.keys(mapping).length) {
    throw new Error('Search mapping response was empty');
  }

  return mapping;
};

/**
 * Fetches the search property mapping from the docs site and caches it in memory.
 *
 * Called at startup and on POST /refresh; there is no interval. A failure at
 * startup is fatal, which is intended: the server should not come up serving an
 * unknown set of search properties. On refresh, the previous mapping is left in
 * place because it is only replaced after a successful fetch.
 */
export const setPropertyMapping = async function () {
  const searchMappingUrl = verifyAndGetEnvVars();

  try {
    const res = await fetch(searchMappingUrl, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      throw new Error(`Search mapping request responded with ${res.status} ${res.statusText}`);
    }

    const searchPropertyMapping = assertUsableMapping(await res.json());
    console.log(`Loaded ${Object.keys(searchPropertyMapping).length} search properties from ${searchMappingUrl}`);

    internals.searchPropertyMapping = searchPropertyMapping;
    return searchPropertyMapping;
  } catch (e) {
    console.error(`Error while creating search property mapping: ${e}`);
    throw e;
  }
};

export const getPropertyMapping = () => {
  return internals['searchPropertyMapping'];
};
