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
