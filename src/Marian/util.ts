import http from 'http';

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
  console.log('check url hostname: ', url.hostname);
  return (
    url.protocol == 'https:' &&
    (url.hostname.split('.')[0] == 'docs-mongodb-org-stg' ||
      arrayEquals(url.hostname.split('.').slice(-2), ['mongodb', 'com']))
  );
}

export function checkAllowedOrigin(origin: string | undefined, headers: Record<string, string>): void {
  console.log('check origin ', origin);
  if (!origin) {
    return;
  }

  let url;
  try {
    url = new URL(origin);
  } catch (err) {
    return;
  }

  if (isPermittedOrigin(url)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
}

/**
 * If the request method does not match the method parameter, return false
 * and write a 405 status code. Otherwise return true.
 */
export function checkMethod(req: http.IncomingMessage, res: http.ServerResponse, method: string): boolean {
  if (req.method !== method) {
    res.writeHead(405, {});
    res.end('');
    return false;
  }

  return true;
}

export const _arrayEquals = arrayEquals;
