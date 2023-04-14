'use strict';
import * as dotenv from 'dotenv';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

import { MongoClient } from 'mongodb';

// plan is to add new fields to search.documents
// ignore source of truth for facet hierarchy
// this is intended to mimic the ending result for mut-index documents
// and add facet category values to search.documents
const test_values = {
  genre: {
    value: 'reference',
    children: [],
  },
};

const test_values_2 = {
  product: {
    value: 'server',
    children: [
      {
        value: 'v5.0',
      },
    ],
  },
};
const test_values_3 = {
  product: {
    value: 'server',
    children: [
      {
        value: 'v6.0',
      },
    ],
  },
};

async function testMigration() {
  const client = await MongoClient.connect(process.env['ATLAS_URI'] || '');
  const db = client.db(process.env['ATLAS_DATABASE']);
  const documents = db.collection('documents');

  const filter = {
    url: /reference/,
  };

  const update = { $set: test_values };

  const filter2 = {
    url: /v5\.0/,
  };

  const update2 = { $set: test_values_2 };

  const filter3 = {
    url: /v6\.0/,
  };
  const update3 = { $set: test_values_3 };

  try {
    const updateRes1 = await documents.updateMany(filter, update);
    const updateRes2 = await documents.updateMany(filter2, update2);
    const updateRes3 = await documents.updateMany(filter3, update3);

    console.log(`update success1 ${JSON.stringify(updateRes1)}`);
    console.log(`update success2: ${JSON.stringify(updateRes2)}`);
    console.log(`update success3: ${JSON.stringify(updateRes3)}`);
  } catch (e) {
    console.error(`Error updating: ${JSON.stringify(e)}`);
  }
}

testMigration()
  .then(() => {
    console.log('success');
  })
  .catch((e) => {
    console.error(e);
  });
