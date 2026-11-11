import { type State, emptyState, uid, type Invitation } from '../src/domain';
import { type Store } from './store';
import { digest, token, verifyPassword, passwordHash } from './security';
import { Problem, mutate, text, money, date } from './mutations';
import { travel } from './travel';
type User = { id: string; email: string; hash: string; role: 'admin' | 'staff'; active: boolean };
type Session = {
  userId: string;
  email: string;
  role: 'admin' | 'staff';
  expires: number;
  credentialVersion?: string;
};
type Doc = {
  state: State;
  audit: { at: string; user: string; action: string }[];
  operations: string[];
};
type Config = { adminEmail?: string; adminHash?: string; now?: () => number };
const response = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
export function createAPI(store: Store, config: Config) {
  const now = config.now ?? Date.now;
  async function update(fn: (s: State) => State, user: string, action: string, operation: string) {
    for (let n = 0; n < 8; n++) {
      const old = await store.get<Doc>('workspace'),
        doc = old?.data ?? { state: emptyState(), audit: [], operations: [] };
      if (doc.operations.includes(operation)) {
        if (action === 'invite')
          throw new Problem(
            'この依頼URLはすでに発行済みです。必要なら無効化して再発行してください',
            409,
          );
        return doc.state;
      }
      const state = fn(doc.state);
      const next = {
        state,
        audit: [...doc.audit, { at: new Date(now()).toISOString(), user, action }].slice(-1000),
        operations: [...doc.operations, operation].slice(-500),
      };
      if (JSON.stringify(next).length > 4_000_000)
        throw new Problem('保存容量の上限に近づいています。管理者に連絡してください', 413);
      if (await store.put('workspace', next, old?.etag ?? null)) return state;
    }
    throw new Problem('同時更新が発生しました。再読み込みして再実行してください', 409);
  }
  async function rateLimit(key: string, max: number) {
    const bucket = `rate/${digest(key)}/${Math.floor(now() / 900000)}`;
    for (let n = 0; n < 8; n++) {
      const old = await store.get<number>(bucket);
      if ((old?.data ?? 0) >= max)
        throw new Problem('試行回数が多すぎます。15分後に再試行してください', 429);
      if (await store.put(bucket, (old?.data ?? 0) + 1, old?.etag ?? null)) return;
    }
    throw new Problem('しばらくして再試行してください', 429);
  }
  return async function handle(req: Request, ip = 'unknown'): Promise<Response> {
    try {
      const url = new URL(req.url),
        path = url.pathname.replace(/^\/(?:\.netlify\/functions\/)?api\/?/, '');
      if (!['GET', 'POST'].includes(req.method))
        throw new Problem('許可されていないメソッドです', 405);
      if (req.method === 'POST' && req.headers.get('origin') !== url.origin)
        throw new Problem('送信元を確認できません', 403);
      let body: Record<string, unknown> = {};
      if (req.method === 'POST') {
        if (!req.headers.get('content-type')?.includes('application/json'))
          throw new Problem('JSON形式で送信してください', 415);
        const raw = await req.text();
        if (raw.length > 150000) throw new Problem('送信データが大きすぎます', 413);
        try {
          body = JSON.parse(raw);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        } catch {
          throw new Problem('送信形式が不正です');
        }
      }
      const operation =
        typeof body.operationId === 'string' ? text(body.operationId, '操作ID', 100) : uid();
      const configured = !!config.adminEmail && !!config.adminHash;
      if (path === 'health' && req.method === 'GET') return response({ ok: true, configured });
      if (path === 'login' && req.method === 'POST') {
        if (!configured)
          throw new Problem(
            'Netlify 環境変数 ADMIN_EMAIL と ADMIN_PASSWORD_HASH を設定してください',
            503,
          );
        const email = text(body.email, 'メールアドレス', 254).toLowerCase(),
          password = text(body.password, 'パスワード', 200);
        await rateLimit(`login-ip:${ip}`, 50);
        await rateLimit(`login-email:${email}`, 15);
        const owner = email === config.adminEmail!.toLowerCase();
        const record = owner ? null : await store.get<User>(`user/${digest(email)}`);
        const user: User = owner
          ? { id: 'owner', email, hash: config.adminHash!, role: 'admin', active: true }
          : (record?.data ?? {
              id: '',
              email,
              hash: config.adminHash!,
              role: 'staff',
              active: false,
            });
        if (!(await verifyPassword(password, user.hash)) || !user.active)
          throw new Problem('メールアドレスまたはパスワードが違います', 401);
        const value = token();
        await store.put(
          `session/${digest(value)}`,
          {
            userId: user.id,
            email,
            role: user.role,
            expires: now() + 8 * 3600000,
            credentialVersion: digest(user.hash),
          },
          null,
        );
        return response({ email, role: user.role }, 200, {
          'set-cookie': `session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol === 'https:' ? '; Secure' : ''}`,
        });
      }
      if (
        (path === 'supplier' && req.method === 'GET') ||
        (path === 'supplier' && req.method === 'POST')
      ) {
        await rateLimit(`supplier-ip:${ip}`, 120);
        const secret = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
        if (!/^[\w-]{43}$/.test(secret)) throw new Problem('回答URLが無効です', 404);
        const ref = await store.get<{ id: string }>(`invitation/${digest(secret)}`);
        if (!ref) throw new Problem('回答URLが無効です', 404);
        const find = (s: State) => {
          const i = s.invitations.find((i) => i.id === ref.data.id);
          if (!i || i.revoked || Date.parse(i.expires) < now())
            throw new Problem('回答URLの期限が切れたか、無効化されています', 410);
          return i;
        };
        const doc = await store.get<Doc>('workspace'),
          inv = find(doc?.data.state ?? emptyState());
        if (req.method === 'GET')
          return response({
            supplier: inv.supplier,
            expires: inv.expires,
            repliedAt: inv.repliedAt,
            lines: inv.lines.map((l) => ({
              code: l.code,
              name: l.name,
              quantity: l.quantity,
              unit: l.unit,
            })),
            prices: inv.prices,
            shipping: inv.shipping,
            delivery: inv.delivery,
            note: inv.note,
          });
        await update(
          (s) => {
            const i = find(s);
            if (i.repliedAt)
              throw new Problem('この依頼は回答済みです。変更は担当者へご連絡ください', 409);
            if (!Array.isArray(body.prices) || body.prices.length !== i.lines.length)
              throw new Problem('全明細の単価を入力してください');
            i.prices = body.prices.map((v) => money(v, '回答単価'));
            i.shipping = money(body.shipping, '送料');
            i.delivery = date(body.delivery, '納期');
            i.note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
            i.repliedAt = new Date(now()).toISOString();
            return s;
          },
          `supplier:${inv.id}`,
          'supplierReply',
          operation,
        );
        return response({ ok: true });
      }
      const cookie = req.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('session='))
        ?.slice(8);
      const sessionKey = `session/${digest(cookie ?? '')}`,
        session = cookie ? (await store.get<Session>(sessionKey))?.data : null;
      if (!session || session.expires < now()) throw new Problem('ログインが必要です', 401);
      if (session.userId === 'owner') {
        if (
          session.email !== config.adminEmail?.toLowerCase() ||
          session.credentialVersion !== digest(config.adminHash ?? '')
        )
          throw new Problem('ログインが必要です', 401);
      } else {
        const u = await store.get<User>(`user/${digest(session.email)}`);
        if (!u?.data.active || u.data.id !== session.userId)
          throw new Problem('ログインが必要です', 401);
      }
      if (path === 'me' && req.method === 'GET')
        return response({ email: session.email, role: session.role });
      if (path === 'logout' && req.method === 'POST') {
        await store.remove(sessionKey);
        return response({ ok: true }, 200, {
          'set-cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
        });
      }
      if (path === 'state' && req.method === 'GET')
        return response((await store.get<Doc>('workspace'))?.data.state ?? emptyState());
      if (path === 'travel' && req.method === 'POST') {
        await rateLimit(`travel:${session.email}`, 20);
        return response(await travel(body.origin, body.destination));
      }
      if (path === 'audit' && req.method === 'GET' && session.role === 'admin')
        return response((await store.get<Doc>('workspace'))?.data.audit ?? []);
      if (path === 'users' && req.method === 'POST') {
        if (session.role !== 'admin') throw new Problem('管理者のみ操作できます', 403);
        const email = text(body.email, 'メールアドレス', 254).toLowerCase(),
          password = text(body.password, 'パスワード', 200);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12)
          throw new Problem('有効なメールアドレスと12文字以上のパスワードが必要です');
        const user: User = {
          id: uid(),
          email,
          hash: await passwordHash(password),
          active: true,
          role: 'staff',
        };
        if (
          email === config.adminEmail?.toLowerCase() ||
          !(await store.put(`user/${digest(email)}`, user, null))
        )
          throw new Problem('登録済みのメールアドレスです', 409);
        return response({ ok: true });
      }
      if (path === 'disable-user' && req.method === 'POST') {
        if (session.role !== 'admin') throw new Problem('管理者のみ操作できます', 403);
        const email = text(body.email, 'メールアドレス', 254).toLowerCase(),
          key = `user/${digest(email)}`,
          old = await store.get<User>(key);
        if (!old) throw new Problem('社員が見つかりません', 404);
        if (!(await store.put(key, { ...old.data, active: false }, old.etag)))
          throw new Problem('再実行してください', 409);
        return response({ ok: true });
      }
      if (path === 'invite' && req.method === 'POST') {
        const value = token(),
          id = uid(),
          supplier = text(body.supplier, '代理店名'),
          expires = new Date(now() + 14 * 86400000).toISOString();
        await store.put(`invitation/${digest(value)}`, { id }, null);
        const state = await update(
          (s) => {
            const e = s.estimates.find((e) => e.id === body.estimateId);
            if (!e) throw new Problem('見積が見つかりません');
            const i: Invitation = {
              id,
              projectId: e.projectId,
              estimateId: e.id,
              supplier,
              expires,
              lines: structuredClone(e.lines),
              prices: null,
              shipping: null,
              delivery: '',
              note: '',
              repliedAt: null,
              revoked: false,
            };
            s.invitations.push(i);
            return s;
          },
          session.email,
          'invite',
          operation,
        );
        return response({ state, url: `${url.origin}/supplier#token=${value}` });
      }
      if (path === 'mutate' && req.method === 'POST') {
        const action = text(body.action, '操作');
        if (action === 'settings' && session.role !== 'admin')
          throw new Problem('管理者のみ設定できます', 403);
        return response(
          await update((s) => mutate(s, action, body), session.email, action, operation),
        );
      }
      throw new Problem('ページが見つかりません', 404);
    } catch (error) {
      if (error instanceof Problem) return response({ error: error.message }, error.status);
      console.error('API request failed', error instanceof Error ? error.name : 'Unknown');
      return response(
        { error: '保存サービスに接続できません。時間をおいて再試行してください' },
        500,
      );
    }
  };
}
