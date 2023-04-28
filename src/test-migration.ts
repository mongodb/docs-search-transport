'use strict';
import * as dotenv from 'dotenv';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

import { MongoClient } from 'mongodb';

// plan is to add new fields to search.documents
// facet structure will be as such:
// Object where each key represents the category (or sub category)
// and each value is a key
// an empty object signifies there are no further properties / children
// this is intended to mimic the ending result for mut-index documents
// and add facet category values to search.documents

// facets: {
//   genre: {
//     'products': {
//       'manual': {
//         'versions': {
//           'v5.0': {}
//           'v6.0': {
//             'subproducts': {
//               'manual-admin': {},
//               'manual-cli': {}
//             },
//             'languages': {
//               'python': {},
//               'javascript': {}
//             }
//           }
//         }
//       },
//       'atlas': {
//         'versions': {
//           'master': {},
//           'v1.0': {}
//         },
//         'subproducts': {
//           'cli': {}
//         }
//       }
//     }
//   }
// }

async function testMigration() {
  const client = await MongoClient.connect(process.env['ATLAS_URI'] || '');
  const db = client.db(process.env['ATLAS_DATABASE']);
  const documents = db.collection('documents');

  const urlFilters = [
    /atlas\-cli/,
    /v5\.0/,
    /v6\.0/
  ];

  const languages = ['python', 'javascript', 'go', 'c'];

  const updates = [
    {
      facets: {
        'products': ['atlas-cli'],
        'products←atlas-cli→versions': ['master'],
        'languages': ['python', 'javascript', 'go', 'c'],
        'languages←python→versions': ['3.7'],
        'languages←javascript→versions': ['es5', 'es6'],
      }
    },
    {
      facets: {
        'products': ['manual'],
        'products←manual→versions': ['v6.0'],
        'languages': ['python', 'javascript'],
      }
    },
    {
      facets: {
        'products': ['manual'],
        'products←manual→versions': ['v5.0'],
        'languages': ['python', 'javascript'],
      }
    },



  ]

  const promises = urlFilters.map(async (filter, index) => {
    const mdFilter = {url: filter}
    const mdUpdate = updates[index]
    return documents.updateMany({url: filter}, {$set: mdUpdate}).then((res) => {
      console.log(`success at res : ${JSON.stringify(res)}`);
      
    })
  })

  try {
    const res = await Promise.all(promises);

    console.log(`update success ${JSON.stringify(res)}`);
  } catch (e) {
    console.log(e);
    
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
