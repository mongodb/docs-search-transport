import { ok, strictEqual } from 'assert';
import * as child_process from 'child_process';
import * as http from 'http';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

export function startServer(path: string, done: () => void): { child: child_process.ChildProcess; port: number } {
  let isDone = false,
    isLoaded = false;
  const child = child_process.spawn('./node_modules/.bin/ts-node', ['./src/index.ts'], {
    stdio: [0, 'pipe', 2],
    env: {
      MANIFEST_URI: 'dir:tests/integration/search_test_data/',
      ATLAS_DATABASE: 'search-test',
      ATLAS_URI: process.env.ATLAS_URI,
      PATH: process.env.PATH,
      GROUP_ID: process.env.GROUP_ID,
      CLUSTER_NAME: process.env.CLUSTER_NAME,
      COLLECTION_NAME: process.env.COLLECTION_NAME,
      ATLAS_ADMIN_API_KEY: process.env.ATLAS_ADMIN_API_KEY,
      ATLAS_ADMIN_PUB_KEY: process.env.ATLAS_ADMIN_PUB_KEY,
    },
  });

  ok(child.stdout);

  const rl = readline.createInterface({
    input: child.stdout,
  });

  const ctx = {
    child: child,
    port: 0,
  };

  rl.on('line', (line: string): void => {
    const match = line.match(/Listening on port ([0-9]+)/);

    if (match) {
      isLoaded = true;
      ctx.port = parseInt(match[1]);
    }

    if (line.match(/Done!$/)) {
      isDone = true;
    } else if (line.match(/Error/)) {
      throw new Error(line);
    }

    if (isDone && isLoaded) {
      done();
      return;
    }
  });

  rl.on('error', (err) => {
    throw err;
  });

  rl.on('end', () => {
    rl.close();
  });

  return ctx;
}

export function request(
  url: string | http.RequestOptions | URL
): Promise<{ response: http.IncomingMessage; json: any }> {
  return new Promise((resolve, reject) => {
    http
      .request(url, (res) => {
        res.setEncoding('utf8');
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            response: res,
            json: data ? JSON.parse(data) : undefined,
          });
        });
        res.on('error', (err) => {
          reject(err);
        });
      })
      .end();
  });
}

describe('http interface', function () {
  this.slow(5000);

  let ctx: { child: child_process.ChildProcess; port: number } | null = null;

  before('starting server', function (done) {
    ctx = startServer('dir:tests/manifests/', done);
  });

  it('should return proper Access-Control-Allow-Origin headers', async function () {
    ok(ctx);
    let result = await request({ port: ctx.port, path: `/status` });
    strictEqual(result.response.headers['access-control-allow-origin'], undefined);

    result = await request({
      port: ctx.port,
      path: `/status`,
      headers: {
        Origin: 'https://example.com',
      },
    });
    strictEqual(result.response.headers['access-control-allow-origin'], undefined);

    result = await request({
      port: ctx.port,
      path: `/status`,
      headers: {
        Origin: 'https://docs.mongodb.com',
      },
    });
    strictEqual(result.response.headers['access-control-allow-origin'], 'https://docs.mongodb.com');

    // Test an unparseable origin URL
    result = await request({
      port: ctx.port,
      path: `/status`,
      headers: {
        Origin: 'gooblygoobly',
      },
    });
    strictEqual(result.response.headers['access-control-allow-origin'], undefined);
  });

  after('shutting down', function () {
    ok(ctx);
    process.kill(ctx.child.pid!, 'SIGINT');
  });
});
