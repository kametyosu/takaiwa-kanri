import { createServer } from 'node:http';
import { createAPI } from '../server/api';
import { memoryStore } from '../server/store';
import { passwordHash } from '../server/security';
const hash = await passwordHash('local-test-password');
const handler = createAPI(memoryStore(), { adminEmail: 'admin@example.test', adminHash: hash });
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    ...(!['GET', 'HEAD'].includes(req.method ?? 'GET') ? { body: Buffer.concat(chunks) } : {}),
  });
  // Vite の開発プロキシ経由の Origin はブラウザ側ポート。
  const origin = request.headers.get('origin');
  if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173')
    request.headers.set('origin', new URL(request.url).origin);
  const result = await handler(request, 'local');
  res.writeHead(result.status, Object.fromEntries(result.headers));
  res.end(await result.text());
}).listen(8787, '127.0.0.1', () =>
  console.log('ローカル検証専用 API。データはメモリのみ。admin@example.test / local-test-password'),
);
