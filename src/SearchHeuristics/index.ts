import { Document } from '../SearchIndex'

// A series of basic heuristics that we can apply to determine if a search result should be indexed
// TODO: Document interface should be defined here and this should be a document abstraction?
// or a SearchableDocument abstraction?

interface FilteredDocuments {
    searchable: Document[];
    unsearchable: Document[];
}

const hasMinimumTextThreshold = (doc: Document) => {
    const MINIMUM_CONTENT_LENGTH = 40;
    return doc.text.length >= MINIMUM_CONTENT_LENGTH;
}

const hasPreview = (doc: Document) => !!doc.preview;

const isInteractive = (doc: Document) => doc.links.length >= 2;

const meetsMinimumSearchableStandard = (doc: Document) => {
    const failsThreshold = (!hasPreview(doc) && (!hasMinimumTextThreshold(doc) || !isInteractive(doc)));
    return !failsThreshold;
}

export const applyHeuristics = (documents: Document[]) => {
    const filteredDocuments: FilteredDocuments = {
        searchable: [],
        unsearchable: [],
    };

    documents.forEach(doc => {
        meetsMinimumSearchableStandard(doc) ? filteredDocuments.searchable.push(doc) : filteredDocuments.unsearchable.push(doc);
    })
    return filteredDocuments;
};