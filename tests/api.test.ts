import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createAPI } from '../server/api';
import { memoryStore, type Store } from '../server/store';
import { passwordHash } from '../server/security';
const origin = 'https://example.test';
let handle: ReturnType<typeof createAPI>, cookie: string, clock: number, store: Store;
async function request(
  path: string,
  body?: unknown,
  auth = cookie,
  headers: Record<string, string> = {},
) {
  return handle(
    new Request(`${origin}/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { origin, 'content-type': 'application/json', cookie: auth, ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    '127.0.0.1',
  );
}
async function createProject() {
  const r = await request('mutate', {
    action: 'project',
    name: '機密現場',
    customer: '機密顧客',
    site: '東京都',
    contract: 100000,
  });
  return (await r.json()).projects[0].id;
}
async function invite() {
  const projectId = await createProject();
  let r = await request('mutate', {
    action: 'estimate',
    projectId,
    name: '内部見積',
    shipping: 0,
    lines: [
      {
        itemId: '',
        code: 'AB-01',
        name: '照明器具',
        unit: '台',
        quantity: 2,
        cost: 500,
        price: 10000,
      },
    ],
  });
  const estimateId = (await r.json()).estimates[0].id;
  r = await request('invite', { estimateId, supplier: 'A商事' });
  const result = await r.json();
  const secret = new URL(result.url).hash.slice(7);
  return { secret, estimateId, invitationId: result.state.invitations[0].id };
}
beforeEach(async () => {
  clock = Date.parse('2026-11-11T00:00:00Z');
  store = memoryStore();
  handle = createAPI(store, {
    adminEmail: 'admin@example.test',
    adminHash: await passwordHash('long-test-password'),
    now: () => clock,
  });
  const r = await request(
    'login',
    { email: 'admin@example.test', password: 'long-test-password' },
    '',
  );
  cookie = r.headers.get('set-cookie')!.split(';')[0];
});
describe('認証・共有保存・代理店の分離', () => {
  it('社内データに匿名でアクセスできない', async () => {
    expect((await request('state', undefined, '')).status).toBe(401);
    expect((await request('mutate', { action: 'project' }, '')).status).toBe(401);
  });
  it('パスワードを確認し、HttpOnly Secure Cookieを発行する', async () => {
    expect(
      (await request('login', { email: 'admin@example.test', password: 'wrong' }, '')).status,
    ).toBe(401);
    const r = await request(
      'login',
      { email: 'admin@example.test', password: 'long-test-password' },
      '',
    );
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('Secure');
    expect(r.headers.get('set-cookie')).toContain('SameSite=Strict');
  });
  it('別オリジンの書き込みを拒否する', async () =>
    expect(
      (await request('mutate', { action: 'project' }, cookie, { origin: 'https://evil.test' }))
        .status,
    ).toBe(403));
  it('8時間後にセッションを失効する', async () => {
    clock += 8 * 3600000 + 1;
    expect((await request('state')).status).toBe(401);
  });
  it('ログアウトしたセッションを再利用できない', async () => {
    await request('logout', {});
    expect((await request('state')).status).toBe(401);
  });
  it('別セッションで同じデータを共有できる', async () => {
    await createProject();
    const r = await request(
      'login',
      { email: 'admin@example.test', password: 'long-test-password' },
      '',
    );
    const other = r.headers.get('set-cookie')!.split(';')[0];
    const data = await (await request('state', undefined, other)).json();
    expect(data.projects[0].name).toBe('機密現場');
  });
  it('代理店には依頼明細のみ公開する', async () => {
    const { secret } = await invite();
    const r = await request('supplier', undefined, '', { authorization: `Bearer ${secret}` });
    const raw = await r.text();
    expect(r.status).toBe(200);
    expect(raw).toContain('AB-01');
    for (const value of [
      '機密現場',
      '機密顧客',
      '10000',
      '500',
      '内部見積',
      'contract',
      'projectId',
      'price"',
    ])
      expect(raw).not.toContain(value);
    expect(
      (await request('state', undefined, '', { authorization: `Bearer ${secret}` })).status,
    ).toBe(401);
  });
  it('回答単価・送料・納期を取り込み、販売価格を維持する', async () => {
    const { secret, invitationId } = await invite();
    const answer = { prices: [4000], shipping: 800, delivery: '2026-11-20', note: '配送可' };
    expect(
      (await request('supplier', answer, '', { authorization: `Bearer ${secret}` })).status,
    ).toBe(200);
    const r = await request('mutate', { action: 'selectSupplier', inviteId: invitationId });
    const s = await r.json();
    expect(s.estimates[0].lines[0].cost).toBe(4000);
    expect(s.estimates[0].lines[0].price).toBe(10000);
    expect(s.estimates[0].shipping).toBe(800);
    expect(s.estimates[0].supplier).toBe('A商事');
    expect(
      (await request('supplier', answer, '', { authorization: `Bearer ${secret}` })).status,
    ).toBe(409);
  });
  it('回答URLの無効化と期限を検証する', async () => {
    const a = await invite();
    await request('mutate', { action: 'revoke', inviteId: a.invitationId });
    expect(
      (await request('supplier', undefined, '', { authorization: `Bearer ${a.secret}` })).status,
    ).toBe(410);
    const b = await invite();
    clock += 15 * 86400000;
    expect(
      (await request('supplier', undefined, '', { authorization: `Bearer ${b.secret}` })).status,
    ).toBe(410);
  });
  it('社員は管理設定・ユーザー作成にアクセスできない', async () => {
    await request('users', { email: 'staff@example.test', password: 'staff-long-password' });
    const r = await request(
      'login',
      { email: 'staff@example.test', password: 'staff-long-password' },
      '',
    );
    const staff = r.headers.get('set-cookie')!.split(';')[0];
    expect((await request('mutate', { action: 'settings' }, staff)).status).toBe(403);
    expect(
      (await request('users', { email: 'other@example.test', password: 'long-password' }, staff))
        .status,
    ).toBe(403);
    await request('disable-user', { email: 'staff@example.test' });
    expect((await request('state', undefined, staff)).status).toBe(401);
  });
  it('同時作成で一方のデータが消えない', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, n) =>
        request('mutate', {
          action: 'project',
          name: `工事${n}`,
          customer: '顧客',
          site: '現場',
          contract: 1000,
        }),
      ),
    );
    expect((await (await request('state')).json()).projects).toHaveLength(5);
  });
  it('操作IDの再送で二重登録しない', async () => {
    const data = {
      operationId: 'same-operation',
      action: 'project',
      name: '工事',
      customer: '顧客',
      site: '現場',
      contract: 1000,
    };
    await request('mutate', data);
    await request('mutate', data);
    expect((await (await request('state')).json()).projects).toHaveLength(1);
  });
  it('同時入金が残額を超える場合は一方を拒否する', async () => {
    const projectId = await createProject();
    const r = await request('mutate', {
      action: 'invoice',
      projectId,
      number: 'INV-1',
      amount: 100000,
      date: '2026-11-11',
      due: '2026-12-11',
    });
    const invoiceId = (await r.json()).invoices[0].id;
    const responses = await Promise.all(
      [1, 2].map(() =>
        request('mutate', { action: 'payment', invoiceId, date: '2026-11-11', amount: 60000 }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  });
  it('APIに認証情報を出力しない', async () => {
    await createProject();
    const raw = await (await request('state')).text();
    expect(raw).not.toContain('hash');
    expect(raw).not.toContain('password');
    const audit = await (await request('audit')).json();
    expect(audit[0].action).toBe('project');
  });
  it('ログイン試行を制限する', async () => {
    for (let n = 0; n < 14; n++)
      await request('login', { email: 'admin@example.test', password: 'bad' }, '');
    expect(
      (await request('login', { email: 'admin@example.test', password: 'bad' }, '')).status,
    ).toBe(429);
  });
  it('初期管理者設定がない公開環境を開放しない', async () => {
    const unconfigured = createAPI(memoryStore(), {});
    const r = await unconfigured(
      new Request(`${origin}/api/login`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a', password: 'b' }),
      }),
    );
    expect(r.status).toBe(503);
  });
  it('経路取得失敗時に架空の距離を返さない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    try {
      const r = await request('travel', { origin: '新宿区', destination: '渋谷区' });
      expect(r.status).toBe(500);
      expect(await r.text()).not.toContain('distance');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
