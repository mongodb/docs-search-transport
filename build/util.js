"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermittedOrigin = exports.arrayEquals = void 0;
function arrayEquals(arr1, arr2) {
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
exports.arrayEquals = arrayEquals;
function isPermittedOrigin(url) {
    return url.protocol == 'https:' && arrayEquals(url.hostname.split('.').slice(-2), ['mongodb', 'com']);
}
exports.isPermittedOrigin = isPermittedOrigin;
