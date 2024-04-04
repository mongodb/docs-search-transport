import { ok, strictEqual } from 'assert';
import * as child_process from 'child_process';
import * as http from 'http';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { request as urllibRequest, RequestOptions } from 'urllib';
// dotenv.config() should be invoked immediately, before any other imports, to ensure config is present
dotenv.config();

export function startServer(path: string, done: () => void): { child: child_process.ChildProcess; port: number } {
  let isDone = false,
    isLoaded = false;
  const child = child_process.spawn('./node_modules/.bin/ts-node', ['./src/index.ts', '--load-manifests'], {
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
      POOL_ATLAS_URI: process.env.ATLAS_URI,
      TAXONOMY_URL: process.env.TAXONOMY_URL,
      S3_BUCKET: 'docs-search-indexes-test',
      S3_PATH: 'search-indexes/preprd',
    },
  });
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', function (data) {
    console.log('stdout: ' + data);
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', function (data) {
    console.log('stderr: ' + data);
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

  it('should create the Atlas Search Index', async () => {
    const groupId = process.env.GROUP_ID;
    const cluster = process.env.CLUSTER_NAME || 'Search';
    const dbname = process.env.ATLAS_DATABASE;
    const collection = process.env.COLLECTION_NAME;
    const getUrl = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${cluster}/fts/indexes/${dbname}/${collection}`;
    const options: RequestOptions = {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
      },
      dataType: 'json',
      digestAuth: `${process.env.ATLAS_ADMIN_PUB_KEY}:${process.env.ATLAS_ADMIN_API_KEY}`,
    };

    const res = await urllibRequest(getUrl, options);
    const target = res.data.find(
      (searchIndex: any) => searchIndex.database === dbname && searchIndex.collectionName === collection
    );
    ok(target);
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

    result = await request({
      port: ctx.port,
      path: `/status`,
      headers: {
        Origin: 'https://docs-mongodb-org-stg.s3.us-east-2.amazonaws.com',
      },
    });
    strictEqual(
      result.response.headers['access-control-allow-origin'],
      'https://docs-mongodb-org-stg.s3.us-east-2.amazonaws.com'
    );

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
