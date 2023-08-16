import fs from 'fs';
import path from 'path';
import { AnyBulkWriteOperation } from 'mongodb';

import { SynonymDocument } from '../data/atlas-types';
import { Taxonomy } from '../SearchIndex/types';

export function getSynonymUpdateOperations(filePath: string): Array<AnyBulkWriteOperation<SynonymDocument>> {
  const csvPath = path.join(__dirname, filePath);
  const csv = fs.readFileSync(csvPath);

  const csvString = csv.toString();

  const newLine = csvString.includes('\r') ? '\r\n' : '\n';

  return csvString.split(newLine).map((csvRow) => {
    // filtering empty strings since they can occur if CSV contains
    // trailing comma
    const synonyms = csvRow.split(',').filter((word) => word !== '');

    // using this 'primary' property as a unique key so that we update an existing synonym
    // record instead of creating a duplicate
    const primary = synonyms[0];

    const synonymDocument: SynonymDocument = { mappingType: 'equivalent', synonyms, primary };

    return { updateOne: { filter: { primary }, update: { $set: synonymDocument }, upsert: true } };
  });
}

export const getFacetKeys = (taxonomy: Taxonomy) => {
  const keySet: Set<string> = new Set();
  const pushKeys = (currentRecord: Taxonomy, baseStr = '') => {
    for (const key in currentRecord) {
      if (!Array.isArray(currentRecord[key])) {
        continue;
      }
      const newBase = baseStr ? `${baseStr}>${currentRecord['name']}>${key}` : key;
      for (const child of currentRecord[key]) {
        pushKeys(child as Taxonomy, newBase);
      }
      keySet.add(`${newBase}`);
    }
  };
  pushKeys(taxonomy);

  return Array.from(keySet);
};

export const _getFacetKeys = getFacetKeys;
