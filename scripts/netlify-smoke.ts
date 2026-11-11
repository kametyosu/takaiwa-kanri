import { NetlifyDev } from '@netlify/dev';
import { passwordHash } from '../server/security';
const base = 'http://localhost:8888';
process.env.ADMIN_EMAIL = 'smoke@example.test';
process.env.NETLIFY_DEV = 'true';
process.env.ADMIN_PASSWORD_HASH = await passwordHash('local-netlify-smoke-only');
const options = {
  projectRoot: process.cwd(),
  skipGitignore: true,
  blobs: { enabled: true },
  functions: { enabled: true },
  redirects: { enabled: true },
  staticFiles: { enabled: true },
  edgeFunctions: { enabled: false },
  database: { enabled: false },
  server: { enabled: false },
  environmentVariables: { enabled: false },
  geolocation: { enabled: false },
  images: { enabled: false },
  aiGateway: { enabled: false },
};
let dev = new NetlifyDev(options);
async function request(path: string, body?: object, cookie = '') {
  const r = await dev.handle(
    new Request(`${base}/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { origin: base, 'content-type': 'application/json', cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  if (!r || !r.ok) throw new Error(`${path}: ${r?.status} ${await r?.text()}`);
  return r;
}
async function login() {
  const r = await request('login', {
    email: 'smoke@example.test',
    password: 'local-netlify-smoke-only',
  });
  return r.headers.get('set-cookie')!.split(';')[0];
}
try {
  await dev.start();
  const health = await (await request('health')).json();
  if (!health.configured) throw new Error('Missing test configuration');
  let cookie = await login();
  await request('me', undefined, cookie);
  await request('state', undefined, cookie);
  const name = `Netlify local smoke ${Date.now()}`;
  const r = await request(
    'mutate',
    { action: 'project', name, customer: '検証用', site: 'ローカル環境のみ', contract: 10000 },
    cookie,
  );
  if (!(await r.json()).projects.some((p: { name: string }) => p.name === name))
    throw new Error('Write missing');
  await dev.stop();
  dev = new NetlifyDev(options);
  await dev.start();
  cookie = await login();
  const data = await (await request('state', undefined, cookie)).json();
  if (!data.projects.some((p: { name: string }) => p.name === name))
    throw new Error('Persistence missing after restart');
  console.log(
    'PASS: Netlify Functions + Blobs local emulator, authentication, conditional write, persistence across restart',
  );
} finally {
  await dev.stop();
}
// 開発用SDKが残す監視タイマーを、この検証プロセス内で終了する。
process.exit(0);
