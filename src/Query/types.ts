import { Filter } from 'mongodb';
import { Document } from '../SearchIndex/types';

type PathObj = {
  value: string;
  multi: string;
};

type Path = string | PathObj;

export type Score = {
  boost: {
    value: number;
  };
};

export type Part = {
  text: {
    path: Path | Path[];
    query: string[];
    score?: Score;
    synonyms?: string;
  };
};

export type CompoundPart = {
  compound: {
    must: Part[];
    mustNot?: Part[];
    score?: Score;
  };
};

type Phrase = {
  phrase: {
    path: string | string[];
    query: string | string[];
  };
};

type Equals = {
  equals: {
    path: string | string[];
    value: boolean;
  };
};

export type Must = Phrase | Equals | Filter<Document>;
