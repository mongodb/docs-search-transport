'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.applyHeuristics = void 0;
const hasMinimumTextThreshold = (doc) => {
  const MINIMUM_CONTENT_LENGTH = 40;
  const titlelessText = doc.text.replace(doc.title, '');
  return titlelessText.length >= MINIMUM_CONTENT_LENGTH;
};
const hasPreview = (doc) => !!doc.preview?.trim();
const isInteractive = (doc) => doc.links?.length >= 2;
const meetsMinimumSearchableStandard = (doc) => {
  const failsThreshold = !hasPreview(doc) && (!hasMinimumTextThreshold(doc) || !isInteractive(doc));
  return !failsThreshold;
};
const applyHeuristics = (documents) => {
  const filteredDocuments = {
    searchable: [],
    unsearchable: [],
  };
  documents.forEach((doc) => {
    meetsMinimumSearchableStandard(doc)
      ? filteredDocuments.searchable.push(doc)
      : filteredDocuments.unsearchable.push(doc);
  });
  return filteredDocuments;
};
exports.applyHeuristics = applyHeuristics;
