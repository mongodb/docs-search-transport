import path from 'path';
import fs from 'fs';
import { SynonymMap } from './data/atlas-types';

export function arrayEquals<T>(arr1: Array<T>, arr2: Array<T>): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i += 1) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
}

export function isPermittedOrigin(url: URL): boolean {
  return url.protocol == 'https:' && arrayEquals(url.hostname.split('.').slice(-2), ['mongodb', 'com']);
}

export function parseSynonymCsv(filePath: string): SynonymMap[] {
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
    const primary = csvRow[0];

    return { mappingType: 'equivalent', synonyms, primary };
  });
}
