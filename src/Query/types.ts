import { Document } from 'mongodb';

type PathObj = {
  value: string;
  multi: string;
};

type Path = string | PathObj;

export type Score = {
  boost?: {
    value: number;
  };
  constant?: {
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

export type NestedCompound = {
  compound: {
    must: Part[];
    mustNot?: Part[];
    score?: Score;
  };
};

export type CompoundPart = Part | Phrase | NestedCompound;

export type Phrase = {
  phrase: {
    path: string | string[];
    query: string | string[];
    slop?: number;
    score?: Score;
  };
};

type Equals = {
  equals: {
    path: string | string[];
    value: boolean;
  };
};

type Must = Phrase | Equals | Document;

export type Compound = {
  should: CompoundPart[];
  must: Must[];
  minimumShouldMatch: number;
};

export interface QueryDocument extends Document {
  searchTerm: string;
  userAgent?: string;
}
