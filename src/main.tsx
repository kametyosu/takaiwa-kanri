import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  Calculator,
  Truck,
  ReceiptText,
  Package,
  Settings,
  Plus,
  ArrowUpRight,
  LogOut,
  Building2,
  ChevronRight,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Copy,
  Search,
  Menu,
  LockKeyhole,
  Download,
} from 'lucide-react';
import {
  emptyState,
  yen,
  today,
  uid,
  laborCost,
  reportCost,
  fuelCost,
  projectSummary,
  estimateTotal,
  estimatePurchase,
  paid,
  type State,
  type Project,
  type Line,
  type Estimate,
  type Invitation,
} from './domain';
import './style.css';
type User = { email: string; role: 'admin' | 'staff' };
const nav = [
  ['dashboard', 'ダッシュボード', LayoutDashboard],
  ['projects', '案件管理', FolderKanban],
  ['reports', '日報・経費', ClipboardList],
  ['estimates', '見積管理', Calculator],
  ['suppliers', '代理店回答', Truck],
  ['invoices', '請求・入金', ReceiptText],
  ['masters', '品番・定型明細', Package],
  ['settings', '設定', Settings],
] as const;
async function api(path: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify({ ...(body as object), operationId: uid() }) } : {}),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error || '通信に失敗しました') as Error & { status: number };
    e.status = r.status;
    throw e;
  }
  return data;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : '処理に失敗しました');
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<{ id: string; 'aria-describedby'?: string }>,
            { id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
function Input({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required = true,
  min,
  step,
  hint,
  defaultValue,
}: {
  label: string;
  name?: string;
  type?: string;
  value?: string | number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  min?: number;
  step?: string;
  hint?: string;
  defaultValue?: string | number;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        name={name}
        type={type}
        required={required}
        {...(value !== undefined
          ? { value }
          : { defaultValue: defaultValue ?? (type === 'date' ? today() : undefined) })}
        onChange={onChange}
        min={min ?? (type === 'number' ? 0 : undefined)}
        step={step ?? (type === 'number' ? '1' : undefined)}
      />
    </Field>
  );
}
function Money({ value }: { value: number }) {
  return <span className="money">{yen(value)}</span>;
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`badge ${children === '未取得' || children === '失注' ? 'gray' : children === '概算' || children === '見積中' ? 'amber' : children === '受注' ? 'blue' : 'green'}`}
    >
      {children}
    </span>
  );
}
function Empty({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <div className="empty">
      <FolderKanban size={30} />
      <h3>{label}</h3>
      <p>案件を起点に、必要な情報を登録していきましょう。</p>
      {onClick && (
        <button className="primary" onClick={onClick}>
          <Plus size={16} />
          新規登録
        </button>
      )}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">TAKAIWA / WORKSPACE</span>
            <h2>{title}</h2>
          </div>
          <button className="icon" aria-label="閉じる" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
const formObject = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));
const num = (v: unknown) => Number(v || 0);
function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState(true),
    [state, setState] = useState<State>(emptyState),
    [page, setPage] = useState(location.hash.slice(1) || 'dashboard'),
    [scope, setScope] = useState(''),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState(''),
    [active, setActive] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [share, setShare] = useState('');
  const [lines, setLines] = useState<Line[]>([]),
    [selectedEstimate, setSelectedEstimate] = useState('');
  const [travelForm, setTravelForm] = useState({
    origin: '',
    destination: '',
    distance: 0,
    basis: '手入力の道路距離',
    roundTrip: true,
    president: 1,
    employees: 1,
    tollStatus: '未取得',
    tollAmount: 0,
    tollBasis: '',
    tollRate: 30,
    tollFixed: 150,
    area: '東京都心',
    fuelActual: false,
    fuelAmount: 0,
    parkingActual: false,
    parkingAmount: 0,
    efficiency: 10,
    fuelPrice: 175,
  });
  const [parkingText, setParkingText] = useState('');
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 5000);
  };
  useEffect(() => {
    api('me')
      .then(async (u) => {
        setUser(u);
        setState(await api('state'));
      })
      .catch((e) => {
        if (e.status !== 401) setError(msg(e));
      })
      .finally(() => setBoot(false));
    const fn = () => setPage(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      api('state')
        .then(setState)
        .catch((e) => {
          if (e.status === 401) {
            setUser(null);
            setError('セッションが切れました。再ログインしてください');
          }
        });
    }, 30000);
    return () => clearInterval(timer);
  }, [user]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(action: string, data: Record<string, unknown>) {
    await run(async () => {
      setState(await api('mutate', { action, ...data }));
      setModal('');
      notify('保存しました');
    });
  }
  const open = (name: string, id = '') => {
    setError('');
    setModal(name);
    setActive(id);
    if (name === 'report') {
      const r = state.reports.find((r) => r.id === id);
      const p = state.projects.find((p) => p.id === (id || scope));
      setTravelForm(
        r
          ? {
              ...travelForm,
              ...r,
              basis: r.distanceBasis,
              tollStatus: r.toll.status,
              tollRate: r.tollRate ?? 30,
              tollFixed: r.tollFixed ?? 150,
              tollAmount: r.toll.amount,
              tollBasis: r.toll.basis,
              fuelActual: r.fuel.status === '実費',
              fuelAmount: r.fuel.amount,
              parkingActual: r.parking.status === '実費',
              parkingAmount: r.parking.amount,
            }
          : {
              ...travelForm,
              origin: '',
              destination: p?.site ?? '',
              distance: 0,
              basis: '道路距離未取得',
              fuelActual: false,
              parkingActual: false,
              tollStatus: '未取得',
              efficiency: state.settings.efficiency,
              fuelPrice: state.settings.fuelPrice,
              area: Object.keys(state.settings.parking)[0],
            },
      );
    }
    if (name === 'estimate') setLines([]);
    if (name === 'settings')
      setParkingText(
        Object.entries(state.settings.parking)
          .map(([k, v]) => `${k},${v}`)
          .join('\n'),
      );
  };
  const refresh = () =>
    run(async () => {
      setState(await api('state'));
      notify('最新の情報に更新しました');
    });
  const changePage = (id: string) => {
    location.hash = id;
    setMobile(false);
    setQuery('');
  };
  const filteredProjects = state.projects.filter(
    (p) =>
      (!scope || p.id === scope) &&
      `${p.name}${p.customer}${p.site}`.toLowerCase().includes(query.toLowerCase()),
  );
  const ids = new Set(filteredProjects.map((p) => p.id));
  const projectName = (id: string) => state.projects.find((p) => p.id === id)?.name ?? '案件';
  const sums = filteredProjects.map((p) => ({ p, ...projectSummary(state, p) }));
  const totals = sums.reduce(
    (a, s) => ({
      contract: a.contract + (s.p.status === '失注' ? 0 : s.p.contract),
      cost: a.cost + s.cost,
      profit: a.profit + (s.p.status === '失注' ? -s.cost : s.profit),
      unpaid: a.unpaid + s.unpaid,
      unbilled: a.unbilled + (s.p.status === '完工' ? s.unbilled : 0),
    }),
    { contract: 0, cost: 0, profit: 0, unpaid: 0, unbilled: 0 },
  );
  const actionButton = (label: string, action: string) => (
    <button className="primary" onClick={() => open(action)}>
      <Plus size={17} />
      {label}
    </button>
  );
  const projectSelect = (defaultId?: string) => (
    <Field label="案件">
      <select
        name="projectId"
        defaultValue={
          defaultId || active || scope || (state.projects.length === 1 ? state.projects[0].id : '')
        }
        required
      >
        <option value="">案件を選択</option>
        {state.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} / {p.customer}
          </option>
        ))}
      </select>
    </Field>
  );
  const submit =
    (
      action: string,
      transform?: (data: Record<string, FormDataEntryValue>) => Record<string, unknown>,
    ) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const d = formObject(e.currentTarget);
      save(action, transform ? transform(d) : d);
    };
  const buttons = (
    <footer className="form-footer">
      <button type="button" onClick={() => setModal('')}>
        キャンセル
      </button>
      <button className="primary" disabled={busy}>
        {busy ? '保存中…' : '保存する'}
        <Check size={16} />
      </button>
    </footer>
  );
  if (boot) return <div className="loading">工事管理を読み込み中…</div>;
  if (!user)
    return (
      <div className="login">
        <div className="login-brand">
          <Building2 size={34} />
          <span>
            高岩工業<span>CONSTRUCTION MANAGEMENT</span>
          </span>
        </div>
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h1>現場と経営を、ひとつに。</h1>
          <p>社内アカウントでログインしてください。</p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = formObject(e.currentTarget);
              run(async () => {
                const u = await api('login', d);
                setUser(u);
                setState(await api('state'));
              });
            }}
          >
            <Input label="メールアドレス" name="email" type="email" />
            <Input label="パスワード" name="password" type="password" />
            <button className="primary full" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? '確認中…' : 'ログイン'}
            </button>
          </form>
          <small>
            共有データは社内アカウント限定。代理店の方は、担当者から届いた回答URLをご利用ください。
          </small>
        </div>
        <span className="login-foot">TAKAIWA WORKSPACE © {new Date().getFullYear()}</span>
      </div>
    );
  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return (
          <>
            <div className="welcome">
              <div>
                <span className="eyebrow">BUSINESS OVERVIEW</span>
                <h1>現場のいまを、ひと目で。</h1>
                <p>案件から入金まで。工事の収支をつなぐワークスペース。</p>
              </div>
              <div className="date-card">
                <span>本日</span>
                <strong>{today().replaceAll('-', ' / ')}</strong>
                <small>金額はすべて税込</small>
              </div>
            </div>
            <div className="stats">
              <Stat
                label="契約金額"
                value={totals.contract}
                detail={`${filteredProjects.filter((p) => p.status !== '失注').length} 件の案件`}
                icon={<FolderKanban />}
              />
              <Stat
                label="実績原価"
                value={totals.cost}
                detail="日報の人工・経費を自動集計"
                icon={<ClipboardList />}
              />
              <Stat
                label="実績粗利益"
                value={totals.profit}
                detail="契約金額 − 計上済み原価"
                icon={<Calculator />}
                accent
              />
              <Stat
                label="未入金額"
                value={totals.unpaid}
                detail={`完工未請求 ${yen(totals.unbilled)}`}
                icon={<ReceiptText />}
              />
            </div>
            {sums.some((s) => s.p.status === '完工' && s.unbilled > 0) && (
              <div className="alert warning">
                <AlertTriangle size={20} />
                <div>
                  <strong>完工案件に未請求があります</strong>
                  <p>
                    {sums
                      .filter((s) => s.p.status === '完工' && s.unbilled > 0)
                      .map((s) => `${s.p.name} ${yen(s.unbilled)}`)
                      .join(' / ')}
                  </p>
                </div>
                <button onClick={() => changePage('invoices')}>
                  請求を確認
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <div className="dashboard-grid">
              <section className="panel">
                <PanelTitle
                  title="案件別 利益率"
                  sub="契約金額に対する計上済み原価から算出"
                  action={
                    <button onClick={() => changePage('projects')}>
                      案件一覧
                      <ArrowUpRight size={15} />
                    </button>
                  }
                />
                {sums.length ? (
                  <div className="chart">
                    {sums
                      .filter((s) => s.p.status !== '失注')
                      .map((s) => (
                        <div className="chart-row" key={s.p.id}>
                          <div>
                            <strong>{s.p.name}</strong>
                            <small>{s.p.customer}</small>
                          </div>
                          <div className="track">
                            <div
                              style={{
                                width: `${Math.min(100, Math.abs(s.margin))}%`,
                                background: s.margin < 0 ? '#c96850' : undefined,
                              }}
                            />
                          </div>
                          <strong className={s.margin < 0 ? 'negative' : ''}>
                            {s.margin.toFixed(1)}%
                          </strong>
                        </div>
                      ))}
                    <p className="caption">
                      原価未計上・未取得費用を含む案件は利益が確定していません。
                    </p>
                  </div>
                ) : (
                  <Empty label="まずは案件を登録しましょう" onClick={() => open('project')} />
                )}
              </section>
              <section className="panel">
                <PanelTitle title="進行状況" sub="案件のステータス" />
                <div className="status-list">
                  {(['見積中', '受注', '完工', '失注'] as const).map((s, n) => (
                    <div key={s}>
                      <span className={`dot dot-${n}`} />
                      <span>{s}</span>
                      <strong>
                        {filteredProjects.filter((p) => p.status === s).length}
                        <small>件</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="quick">
                  <span className="eyebrow">QUICK ACTION</span>
                  <button onClick={() => open('report')}>
                    <ClipboardList size={18} />
                    今日の日報を作成
                    <Plus size={17} />
                  </button>
                  <button onClick={() => open('estimate')}>
                    <Calculator size={18} />
                    見積を作成
                    <Plus size={17} />
                  </button>
                </div>
              </section>
            </div>
            <section className="panel">
              <PanelTitle
                title="最近の日報"
                sub="現場からの実績報告"
                action={
                  <button onClick={() => changePage('reports')}>
                    すべて見る
                    <ArrowUpRight size={15} />
                  </button>
                }
              />
              {reportTable(
                state.reports
                  .filter((r) => ids.has(r.projectId))
                  .slice(-5)
                  .reverse(),
              )}
            </section>
          </>
        );
      case 'projects':
        return (
          <>
            <PageTitle
              eyebrow="PROJECTS"
              title="案件管理"
              sub="得意先・現場ごとの収支を、一元管理。"
              action={actionButton('案件を登録', 'project')}
            />
            <div className="project-grid">
              {sums.map((s) => (
                <article className="project-card" key={s.p.id}>
                  <div className="card-top">
                    <span className="project-code">PJ-{s.p.id.slice(0, 6).toUpperCase()}</span>
                    <Badge>{s.p.status}</Badge>
                  </div>
                  <h2>{s.p.name}</h2>
                  <p>{s.p.customer}</p>
                  <div className="site">
                    <Building2 size={15} />
                    {s.p.site}
                  </div>
                  <div className="project-amount">
                    <span>契約金額</span>
                    <Money value={s.p.contract} />
                  </div>
                  <div className="project-metrics">
                    <div>
                      <small>実績原価</small>
                      <Money value={s.cost} />
                    </div>
                    <div>
                      <small>実績粗利益</small>
                      <strong className={s.profit < 0 ? 'negative' : 'positive'}>
                        {yen(s.profit)}
                      </strong>
                    </div>
                  </div>
                  <div className="margin">
                    <span>利益率 {s.margin.toFixed(1)}%</span>
                    <small>{s.uncertain ? '概算・未取得の経費あり' : '計上済み原価ベース'}</small>
                  </div>
                  <div className="track">
                    <div style={{ width: `${Math.max(0, Math.min(100, s.margin))}%` }} />
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={() => {
                        setScope(s.p.id);
                        changePage('reports');
                      }}
                    >
                      日報・経費
                      <ChevronRight size={14} />
                    </button>
                    <button onClick={() => open('status', s.p.id)}>状態・契約編集</button>
                  </div>
                </article>
              ))}
            </div>
            {!sums.length && <Empty label="案件がありません" onClick={() => open('project')} />}
            <section className="panel">
              <PanelTitle title="得意先別の収支" sub="失注案件は原価のみ集計" />
              <Table headings={['得意先', '契約金額', '実績原価', '粗利益', '利益率']}>
                {[...new Set(filteredProjects.map((p) => p.customer))].map((c) => {
                  const group = sums.filter((s) => s.p.customer === c),
                    sales = group.reduce(
                      (a, s) => a + (s.p.status === '失注' ? 0 : s.p.contract),
                      0,
                    ),
                    cost = group.reduce((a, s) => a + s.cost, 0);
                  return (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>{yen(sales)}</td>
                      <td>{yen(cost)}</td>
                      <td>{yen(sales - cost)}</td>
                      <td>{sales ? (((sales - cost) / sales) * 100).toFixed(1) : '—'}%</td>
                    </tr>
                  );
                })}
              </Table>
            </section>
          </>
        );
      case 'reports':
        return (
          <>
            <PageTitle
              eyebrow="DAILY REPORTS"
              title="日報・経費"
              sub="社長 40,000円 / 人工・社員 20,000円 / 人工。現場原価を自動集計。"
              action={actionButton('日報を作成', 'report')}
            />
            <div className="notice">
              <ClipboardList size={18} />
              人工・燃料費・高速料金・駐車料金・材料費が、案件の実績原価に反映されます。
            </div>
            <section className="panel">
              {reportTable(
                state.reports
                  .filter((r) => ids.has(r.projectId))
                  .slice()
                  .reverse(),
              )}
            </section>
          </>
        );
      case 'estimates':
        return (
          <>
            <PageTitle
              eyebrow="ESTIMATES"
              title="見積管理"
              sub="品番・定型明細から作成し、代理店の仕入価格を比較。"
              action={actionButton('見積を作成', 'estimate')}
            />
            <section className="panel">
              <Table
                headings={['見積名 / 案件', '明細', '見積金額', '仕入参考額', '選定代理店', '操作']}
              >
                {state.estimates
                  .filter((e) => ids.has(e.projectId))
                  .map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.name}</strong>
                        <small>{projectName(e.projectId)}</small>
                      </td>
                      <td>{e.lines.length} 行</td>
                      <td>{yen(estimateTotal(e))}</td>
                      <td>{yen(estimatePurchase(e))}</td>
                      <td>{e.supplier || '未選定'}</td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => open('estimateDetail', e.id)}>明細</button>
                          <button
                            onClick={() => {
                              setSelectedEstimate(e.id);
                              open('invite', e.id);
                            }}
                          >
                            相見積依頼
                            <ArrowUpRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </Table>
              {!state.estimates.some((e) => ids.has(e.projectId)) && (
                <Empty label="見積がありません" onClick={() => open('estimate')} />
              )}
            </section>
            <p className="caption">
              見積の仕入参考額は計画用です。実績原価には日報の材料・その他実費を登録してください。送料は見積に1回だけ加算されます。
            </p>
          </>
        );
      case 'suppliers':
        return (
          <>
            <PageTitle
              eyebrow="SUPPLIER QUOTATIONS"
              title="代理店回答"
              sub="専用URLで回答を受け付け、価格・送料・納期を比較。"
              action={
                <button className="primary" onClick={() => open('invite')}>
                  <Plus size={17} />
                  回答URLを発行
                </button>
              }
            />
            <div className="notice">
              <LockKeyhole size={18} />
              URLの有効期限は14日間。案件の利益・他社価格・社内情報は代理店に公開されません。
            </div>
            {state.estimates
              .filter(
                (e) => ids.has(e.projectId) && state.invitations.some((i) => i.estimateId === e.id),
              )
              .map((e) => (
                <section className="panel" key={e.id}>
                  <PanelTitle title={e.name} sub={projectName(e.projectId)} />
                  <Table
                    headings={[
                      '代理店',
                      '回答価格（数量込み）',
                      '送料',
                      '合計',
                      '納期',
                      '状態',
                      '操作',
                    ]}
                  >
                    {state.invitations
                      .filter((i) => i.estimateId === e.id)
                      .map((i) => {
                        const total = i.prices?.reduce((a, p, n) => a + p * i.lines[n].quantity, 0);
                        return (
                          <tr key={i.id}>
                            <td>
                              <strong>{i.supplier}</strong>
                              <small>期限 {i.expires.slice(0, 10)}</small>
                              {i.note && <small>{i.note}</small>}
                            </td>
                            <td>{total !== undefined ? yen(total) : '—'}</td>
                            <td>{i.shipping !== null ? yen(i.shipping) : '—'}</td>
                            <td>{total !== undefined ? yen(total + (i.shipping ?? 0)) : '—'}</td>
                            <td>{i.delivery || '—'}</td>
                            <td>
                              <Badge>
                                {i.revoked
                                  ? '無効'
                                  : Date.parse(i.expires) < Date.now() && !i.repliedAt
                                    ? '期限切れ'
                                    : i.repliedAt
                                      ? '回答済み'
                                      : '回答待ち'}
                              </Badge>
                            </td>
                            <td>
                              <div className="row-actions">
                                {i.prices && !i.revoked && (
                                  <button
                                    className={e.inviteId === i.id ? 'selected' : ''}
                                    disabled={busy || e.inviteId === i.id}
                                    onClick={() => save('selectSupplier', { inviteId: i.id })}
                                  >
                                    {e.inviteId === i.id ? '取り込み済み' : '価格を取り込む'}
                                  </button>
                                )}
                                {!i.revoked && (
                                  <button
                                    onClick={() => save('revoke', { inviteId: i.id })}
                                    disabled={busy}
                                  >
                                    無効化
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </Table>
                </section>
              ))}
            {!state.invitations.length && (
              <Empty label="代理店への依頼がありません" onClick={() => open('invite')} />
            )}
          </>
        );
      case 'invoices':
        return (
          <>
            <PageTitle
              eyebrow="BILLING & PAYMENTS"
              title="請求・入金"
              sub="分割請求と部分入金を、案件の契約金額から追跡。"
              action={actionButton('請求を作成', 'invoice')}
            />
            {sums
              .filter((s) => s.p.status === '完工' && s.unbilled > 0)
              .map((s) => (
                <div className="alert warning" key={s.p.id}>
                  <AlertTriangle size={19} />
                  <div>
                    <strong>
                      {s.p.name}：完工未請求 {yen(s.unbilled)}
                    </strong>
                    <p>
                      請求済み {yen(s.billed)} / 契約 {yen(s.p.contract)}
                    </p>
                  </div>
                  <button onClick={() => open('invoice', s.p.id)}>
                    請求を作成
                    <ChevronRight size={16} />
                  </button>
                </div>
              ))}
            <section className="panel">
              <Table
                headings={[
                  '請求番号 / 案件',
                  '請求日 / 期限',
                  '請求額',
                  '入金済み',
                  '残額',
                  '状態',
                  '操作',
                ]}
              >
                {state.invoices
                  .filter((i) => ids.has(i.projectId))
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.number}</strong>
                        <small>{projectName(i.projectId)}</small>
                      </td>
                      <td>
                        {i.date}
                        <small>{i.due}</small>
                      </td>
                      <td>{yen(i.amount)}</td>
                      <td>{yen(paid(i))}</td>
                      <td>{yen(i.amount - paid(i))}</td>
                      <td>
                        <Badge>
                          {paid(i) === i.amount
                            ? '入金済み'
                            : i.due < today()
                              ? '期限超過'
                              : paid(i) > 0
                                ? '一部入金'
                                : '未入金'}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => open('invoiceDetail', i.id)}>明細</button>
                          {paid(i) < i.amount && (
                            <button onClick={() => open('payment', i.id)}>入金登録</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </Table>
              {!state.invoices.some((i) => ids.has(i.projectId)) && (
                <Empty label="請求がありません" onClick={() => open('invoice')} />
              )}
            </section>
          </>
        );
      case 'masters':
        return (
          <>
            <PageTitle
              eyebrow="MASTER DATA"
              title="品番・定型明細"
              sub="よく使う品番と工事明細を登録して、入力をもっと短く。"
              action={actionButton('品番を登録', 'item')}
            />
            <section className="panel">
              <PanelTitle title="品番マスター" sub={`${state.items.length} 品番`} />
              <Table headings={['品番', '品名', '単位', '標準見積単価']}>
                {state.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.code}</strong>
                    </td>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td>{yen(i.price)}</td>
                  </tr>
                ))}
              </Table>
              {!state.items.length && (
                <Empty label="品番を登録してください" onClick={() => open('item')} />
              )}
            </section>
            <section className="panel">
              <PanelTitle title="定型明細" sub="見積作成画面から、明細の組み合わせを保存できます" />
              {state.templates.length ? (
                <div className="template-grid">
                  {state.templates.map((t) => (
                    <div key={t.id}>
                      <Package size={20} />
                      <strong>{t.name}</strong>
                      <small>{t.lines.length} 行</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="padding muted">保存済みの定型明細はありません。</p>
              )}
            </section>
          </>
        );
      case 'settings':
        return (
          <>
            <PageTitle
              eyebrow="SETTINGS"
              title="設定"
              sub="日報の計算条件と、社内アカウントを管理。"
            />
            <div className="dashboard-grid">
              <section className="panel">
                <PanelTitle
                  title="経費の計算設定"
                  sub="変更後に作成する日報に反映"
                  action={
                    user.role === 'admin' ? (
                      <button onClick={() => open('settings')}>編集する</button>
                    ) : undefined
                  }
                />
                <div className="setting-values">
                  <div>
                    <span>燃料単価</span>
                    <strong>{state.settings.fuelPrice} 円/L</strong>
                  </div>
                  <div>
                    <span>燃費</span>
                    <strong>{state.settings.efficiency} km/L</strong>
                  </div>
                  {Object.entries(state.settings.parking).map(([k, v]) => (
                    <div key={k}>
                      <span>駐車 / {k}</span>
                      <strong>{yen(v)} / 日</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <PanelTitle title="社内アカウント" sub="代理店の方は回答URLを利用します" />
                <div className="padding">
                  <p>
                    {user.email} <Badge>{user.role === 'admin' ? '管理者' : '社員'}</Badge>
                  </p>
                  {user.role === 'admin' && (
                    <>
                      <button onClick={() => open('user')}>
                        <Plus size={16} />
                        社員アカウントを作成
                      </button>
                      <button onClick={() => open('disableUser')}>社員アカウントを停止</button>
                    </>
                  )}
                  <p className="caption">
                    ログインは8時間で期限切れになります。管理者パスワードの変更は Netlify
                    の環境変数から行ってください。
                  </p>
                </div>
              </section>
            </div>
            <section className="panel">
              <PanelTitle
                title="共有保存とデータ出力"
                sub="Netlify Blobs に社内で共有保存。更新は30秒ごとに取得。"
              />
              <div className="padding">
                <p>金額は税込で統一。概算・未取得の費用がある案件は原価未確定です。</p>
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `takaiwa-backup-${today()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={16} />
                  業務データをJSONで出力
                </button>
                {user.role === 'admin' && (
                  <button
                    onClick={() =>
                      run(async () => {
                        const audit = await api('audit');
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' }),
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `audit-${today()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    操作履歴を出力
                  </button>
                )}
              </div>
            </section>
          </>
        );
      default:
        return <Empty label="ページが見つかりません" />;
    }
  };
  function reportTable(reports: State['reports']) {
    return reports.length ? (
      <Table
        headings={['日付 / 案件', '人工原価', '交通・駐車', '材料・その他', '合計原価', '詳細']}
      >
        {reports.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>{r.date}</strong>
              <small>{projectName(r.projectId)}</small>
            </td>
            <td>
              {yen(laborCost(r))}
              <small>
                社長 {r.president} / 社員 {r.employees} 人工
              </small>
            </td>
            <td>
              {yen(r.fuel.amount + r.toll.amount + r.parking.amount)}
              <small>
                {[r.fuel, r.toll, r.parking].some((c) => c.status === '未取得')
                  ? '未取得あり'
                  : [r.fuel, r.toll, r.parking].some((c) => c.status === '概算')
                    ? '概算を含む'
                    : '実費'}
              </small>
            </td>
            <td>{yen(r.material)}</td>
            <td>
              <strong>{yen(reportCost(r))}</strong>
            </td>
            <td>
              <button onClick={() => open('reportDetail', r.id)}>
                計算根拠
                <ChevronRight size={14} />
              </button>{' '}
              <button onClick={() => open('report', r.id)}>編集</button>
            </td>
          </tr>
        ))}
      </Table>
    ) : (
      <Empty label="日報はまだありません" onClick={() => open('report')} />
    );
  }
  function addItem(itemId: string) {
    const i = state.items.find((i) => i.id === itemId);
    if (i)
      setLines([
        ...lines,
        {
          itemId: i.id,
          code: i.code,
          name: i.name,
          unit: i.unit,
          quantity: 1,
          cost: 0,
          price: i.price,
        },
      ]);
  }
  const updateLine = (n: number, key: keyof Line, value: string | number) =>
    setLines(lines.map((l, i) => (i === n ? { ...l, [key]: value } : l)));
  const lineEditor = (
    <>
      <div className="line-tools">
        <select aria-label="品番から追加" value="" onChange={(e) => addItem(e.target.value)}>
          <option value="">品番マスターから追加</option>
          {state.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} / {i.name}
            </option>
          ))}
        </select>
        <select
          aria-label="定型明細から追加"
          value=""
          onChange={(e) => {
            const t = state.templates.find((t) => t.id === e.target.value);
            if (t) setLines([...lines, ...structuredClone(t.lines)]);
          }}
        >
          <option value="">定型明細から追加</option>
          {state.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            setLines([
              ...lines,
              { itemId: '', code: '', name: '', unit: '式', quantity: 1, cost: 0, price: 0 },
            ])
          }
        >
          <Plus size={14} />
          手入力行
        </button>
      </div>
      <div className="table-wrap">
        <table className="line-editor">
          <thead>
            <tr>
              {['品番', '品名', '単位', '数量', '仕入単価', '見積単価', ''].map((h, n) => (
                <th key={n}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, n) => (
              <tr key={n}>
                {(['code', 'name', 'unit', 'quantity', 'cost', 'price'] as const).map((k) => (
                  <td key={k}>
                    <input
                      aria-label={`${n + 1}行目 ${k}`}
                      required
                      value={l[k]}
                      type={['quantity', 'cost', 'price'].includes(k) ? 'number' : 'text'}
                      min={0}
                      step={k === 'quantity' ? '0.01' : '1'}
                      onChange={(e) =>
                        updateLine(
                          n,
                          k,
                          ['quantity', 'cost', 'price'].includes(k)
                            ? num(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    aria-label={`${n + 1}行目削除`}
                    onClick={() => setLines(lines.filter((_, i) => i !== n))}
                  >
                    <X size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  const detailEstimate = state.estimates.find((e) => e.id === active),
    detailReport = state.reports.find((r) => r.id === active),
    detailInvoice = state.invoices.find((i) => i.id === active);
  const tf = travelForm,
    km = tf.distance * (tf.roundTrip ? 2 : 1),
    fuel = fuelCost(tf.distance, tf.roundTrip, tf.efficiency || 1, tf.fuelPrice || 1);
  return (
    <div className="shell">
      <aside className={mobile ? 'sidebar visible' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={24} />
          </div>
          <div>
            高岩工業<small>工事管理ワークスペース</small>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => changePage(id)}>
              <Icon size={19} />
              <span>{label}</span>
              {page === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          社内共有ワークスペース<small>高岩工業 / TAKAIWA</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon"
              onClick={() => setMobile(!mobile)}
              aria-label="メニュー"
            >
              <Menu />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="account">
            <button
              className="icon"
              title="再読み込み"
              aria-label="再読み込み"
              onClick={refresh}
              disabled={busy}
            >
              <RefreshCw size={17} />
            </button>
            <div className="avatar">{user.role === 'admin' ? '管' : '社'}</div>
            <div>
              <strong>{user.role === 'admin' ? '管理者' : '社員'}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="icon"
              title="ログアウト"
              aria-label="ログアウト"
              onClick={() =>
                run(async () => {
                  await api('logout', {});
                  setUser(null);
                  setState(emptyState());
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="filters">
            <div className="scope">
              <Building2 size={16} />
              <select
                aria-label="案件で絞り込む"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="">すべての案件</option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="search">
              <Search size={16} />
              <input
                aria-label="案件・得意先を検索"
                placeholder="案件・得意先を検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {error && !modal && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {renderPage()}
          <div className="page-footer">
            TAKAIWA CONSTRUCTION MANAGEMENT<span>案件にひもづく、確かな収支。</span>
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Dialog
          title={
            (
              {
                project: '案件を登録',
                status: '状態・契約金額を更新',
                report: '日報を作成',
                reportDetail: '日報の計算根拠',
                estimate: '見積を作成',
                estimateDetail: '見積明細',
                invite: '代理店の回答URLを発行',
                invoice: '請求を作成',
                invoiceDetail: '請求・入金明細',
                payment: '入金を登録',
                item: '品番を登録',
                settings: '経費の計算設定',
                user: '社員アカウントを作成',
                disableUser: '社員アカウントを停止',
                share: '回答URLを発行しました',
              } as Record<string, string>
            )[modal] || modal
          }
          onClose={() => setModal('')}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {modal === 'project' && (
            <form onSubmit={submit('project', (d) => ({ ...d, contract: num(d.contract) }))}>
              <div className="form-grid">
                <Input label="案件名" name="name" />
                <Input label="得意先" name="customer" />
                <Input label="現場住所" name="site" />
                <Input label="契約金額（税込）" name="contract" type="number" />
              </div>
              {buttons}
            </form>
          )}
          {modal === 'status' &&
            (() => {
              const p = state.projects.find((p) => p.id === active)!;
              return (
                <form
                  onSubmit={submit('status', (d) => ({
                    ...d,
                    projectId: p.id,
                    contract: num(d.contract),
                  }))}
                >
                  <p>{p.name}</p>
                  <Field label="案件状態">
                    <select name="status" defaultValue={p.status}>
                      {['見積中', '受注', '完工', '失注'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Input
                    label="契約金額（税込）"
                    name="contract"
                    type="number"
                    defaultValue={p.contract}
                  />
                  <p className="caption">
                    現在の契約金額：{yen(p.contract)}。更新する金額を入力してください。
                  </p>
                  {buttons}
                </form>
              );
            })()}
          {modal === 'item' && (
            <form onSubmit={submit('item', (d) => ({ ...d, price: num(d.price) }))}>
              <div className="form-grid">
                <Input label="品番" name="code" />
                <Input label="品名" name="name" />
                <Input label="単位" name="unit" />
                <Input label="標準見積単価（税込）" name="price" type="number" />
              </div>
              {buttons}
            </form>
          )}
          {modal === 'report' && (
            <form
              onSubmit={submit('report', (d) => ({
                ...d,
                ...tf,
                id: state.reports.some((r) => r.id === active) ? active : undefined,
                projectId: d.projectId,
                date: d.date,
                distanceBasis: tf.basis,
                fuelBasis: d.fuelBasis,
                parkingBasis: d.parkingBasis,
                material: num(d.material),
                note: d.note,
                toll:
                  tf.tollStatus === '概算'
                    ? {
                        status: '概算',
                        amount: Math.round(km * tf.tollRate + tf.tollFixed),
                        basis: `${km}km × ${tf.tollRate}円/km ＋ ${tf.tollFixed}円。入力道路距離全体に対する簡易モデル。車種・IC・割引は未反映。公式料金ではありません。`,
                      }
                    : { status: tf.tollStatus, amount: tf.tollAmount, basis: tf.tollBasis },
              }))}
            >
              <div className="form-grid">
                {projectSelect(detailReport?.projectId)}
                <Input label="作業日" name="date" type="date" defaultValue={detailReport?.date} />
                <Input
                  label="社長（人工）"
                  type="number"
                  value={tf.president}
                  step="0.25"
                  onChange={(e) => setTravelForm({ ...tf, president: num(e.target.value) })}
                />
                <Input
                  label="社員（人工）"
                  type="number"
                  value={tf.employees}
                  step="0.25"
                  onChange={(e) => setTravelForm({ ...tf, employees: num(e.target.value) })}
                />
              </div>
              <div className="inline-total">
                人工原価 <strong>{yen(laborCost(tf))}</strong>
                <small>社長 × 40,000円 ＋ 社員 × 20,000円</small>
              </div>
              <h3>交通費・駐車料金</h3>
              <div className="form-grid">
                <Input
                  label="出発地"
                  value={tf.origin}
                  onChange={(e) =>
                    setTravelForm({
                      ...tf,
                      origin: e.target.value,
                      distance: 0,
                      basis: '住所変更後・距離未取得',
                    })
                  }
                />
                <Input
                  label="到着地"
                  value={tf.destination}
                  onChange={(e) =>
                    setTravelForm({
                      ...tf,
                      destination: e.target.value,
                      distance: 0,
                      basis: '住所変更後・距離未取得',
                    })
                  }
                />
              </div>
              <button
                type="button"
                disabled={busy || !tf.origin || !tf.destination}
                onClick={() =>
                  run(async () => {
                    const r = await api('travel', {
                      origin: tf.origin,
                      destination: tf.destination,
                    });
                    setTravelForm({ ...tf, distance: r.distance, basis: r.basis });
                    notify(`検索地点：${r.from} → ${r.to}。地点をご確認ください。`);
                  })
                }
              >
                <Search size={16} />
                住所から道路距離を取得
              </button>
              <p className="caption">
                国土地理院の住所検索と OSRM
                の公開経路サービスを使用。取得できない場合は、経路検索の距離を手入力してください。
              </p>
              <div className="form-grid">
                <Input
                  label="片道道路距離（km）"
                  type="number"
                  step="0.1"
                  value={tf.distance}
                  onChange={(e) =>
                    setTravelForm({
                      ...tf,
                      distance: num(e.target.value),
                      basis: '経路検索から手入力した片道道路距離（要確認）',
                    })
                  }
                />
                <Field label="移動区分">
                  <select
                    value={tf.roundTrip ? 'round' : 'one'}
                    onChange={(e) =>
                      setTravelForm({ ...tf, roundTrip: e.target.value === 'round' })
                    }
                  >
                    <option value="round">往復</option>
                    <option value="one">片道</option>
                  </select>
                </Field>
                <Input
                  label="燃費（km/L）"
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={tf.efficiency}
                  onChange={(e) => setTravelForm({ ...tf, efficiency: num(e.target.value) })}
                />
                <Input
                  label="燃料単価（円/L）"
                  type="number"
                  min={1}
                  value={tf.fuelPrice}
                  onChange={(e) => setTravelForm({ ...tf, fuelPrice: num(e.target.value) })}
                />
              </div>
              <div className="calculation">
                <Badge>{fuel.status}</Badge>
                <strong>燃料費 {yen(fuel.amount)}</strong>
                <p>{fuel.basis}</p>
                <small>{tf.basis}</small>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={tf.fuelActual}
                  onChange={(e) => setTravelForm({ ...tf, fuelActual: e.target.checked })}
                />
                燃料費を実費で上書き
              </label>
              {tf.fuelActual && (
                <div className="form-grid">
                  <Input
                    label="燃料実費"
                    type="number"
                    value={tf.fuelAmount}
                    onChange={(e) => setTravelForm({ ...tf, fuelAmount: num(e.target.value) })}
                  />
                  <Input
                    label="燃料実費の根拠（領収書等）"
                    name="fuelBasis"
                    defaultValue={detailReport?.fuel.basis}
                  />
                </div>
              )}
              <div className="form-grid">
                <Field label="高速料金の区分">
                  <select
                    value={tf.tollStatus}
                    onChange={(e) => setTravelForm({ ...tf, tollStatus: e.target.value })}
                  >
                    {['未取得', '概算', '実費'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                {tf.tollStatus === '実費' && (
                  <>
                    <Input
                      label="高速料金の実費（合計）"
                      type="number"
                      value={tf.tollAmount}
                      onChange={(e) => setTravelForm({ ...tf, tollAmount: num(e.target.value) })}
                    />
                    <Input
                      label="高速料金の根拠（IC・車種・明細等）"
                      value={tf.tollBasis}
                      onChange={(e) => setTravelForm({ ...tf, tollBasis: e.target.value })}
                    />
                  </>
                )}
                {tf.tollStatus === '概算' && (
                  <>
                    <Input
                      label="高速概算単価（円/km）"
                      type="number"
                      value={tf.tollRate}
                      onChange={(e) => setTravelForm({ ...tf, tollRate: num(e.target.value) })}
                    />
                    <Input
                      label="高速概算固定額（円）"
                      type="number"
                      value={tf.tollFixed}
                      onChange={(e) => setTravelForm({ ...tf, tollFixed: num(e.target.value) })}
                    />
                  </>
                )}
              </div>
              {tf.tollStatus === '概算' && (
                <div className="calculation">
                  <Badge>概算</Badge>
                  <strong>{yen(Math.round(km * tf.tollRate + tf.tollFixed))}</strong>
                  <p>
                    {km}km × {tf.tollRate}円/km ＋ {tf.tollFixed}
                    円。公式料金ではありません。実際のIC・車種・割引を反映していません。
                  </p>
                </div>
              )}
              {tf.tollStatus === '未取得' && (
                <p className="caption">
                  高速料金は未取得として0円で仮集計します。高速未利用なら実費0円・根拠「高速未利用」で登録してください。
                </p>
              )}
              <Field label="駐車エリア">
                <select
                  value={tf.area}
                  onChange={(e) => setTravelForm({ ...tf, area: e.target.value })}
                >
                  {Object.entries(state.settings.parking).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} / {yen(v)}（概算）
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={tf.parkingActual}
                  onChange={(e) => setTravelForm({ ...tf, parkingActual: e.target.checked })}
                />
                駐車料金を実費で上書き
              </label>
              {tf.parkingActual && (
                <div className="form-grid">
                  <Input
                    label="駐車実費"
                    type="number"
                    value={tf.parkingAmount}
                    onChange={(e) => setTravelForm({ ...tf, parkingAmount: num(e.target.value) })}
                  />
                  <Input
                    label="駐車実費の根拠"
                    name="parkingBasis"
                    defaultValue={detailReport?.parking.basis}
                  />
                </div>
              )}
              <Input
                label="材料・その他実費（税込）"
                name="material"
                type="number"
                defaultValue={detailReport?.material ?? 0}
                hint="見積で選定した仕入も、実際に発生した分をここに記録します。"
              />
              <Field label="作業内容・経費メモ">
                <textarea name="note" rows={3} defaultValue={detailReport?.note} />
              </Field>
              {buttons}
            </form>
          )}
          {modal === 'reportDetail' && detailReport && (
            <>
              <p>
                {projectName(detailReport.projectId)} / {detailReport.date}
              </p>
              <div className="calculation">
                <strong>人工 {yen(laborCost(detailReport))}</strong>
                <p>
                  社長 {detailReport.president}人工 × 40,000円 ＋ 社員 {detailReport.employees}人工
                  × 20,000円
                </p>
              </div>
              <p>
                {detailReport.origin} → {detailReport.destination}
              </p>
              <p className="caption">{detailReport.distanceBasis}</p>
              {[
                ['燃料費', detailReport.fuel],
                ['高速料金', detailReport.toll],
                ['駐車料金', detailReport.parking],
              ].map(([label, c]) => {
                const v = c as typeof detailReport.fuel;
                return (
                  <div className="calculation" key={String(label)}>
                    <Badge>{v.status}</Badge>
                    <strong>
                      {String(label)} {yen(v.amount)}
                    </strong>
                    <p>{v.basis}</p>
                  </div>
                );
              })}
              <p>材料・その他実費 {yen(detailReport.material)}</p>
              <p>{detailReport.note}</p>
              <div className="inline-total">
                合計原価<strong>{yen(reportCost(detailReport))}</strong>
              </div>
            </>
          )}
          {modal === 'estimate' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = formObject(e.currentTarget);
                save('estimate', { ...d, shipping: num(d.shipping), lines });
              }}
            >
              <div className="form-grid">
                {projectSelect()}
                <Input label="見積名" name="name" />
              </div>
              {lineEditor}
              <Input label="送料（税込）" name="shipping" type="number" />
              <div className="inline-total">
                見積金額
                <strong>{yen(lines.reduce((a, l) => a + l.quantity * l.price, 0))} ＋ 送料</strong>
              </div>
              <div className="form-grid">
                <Input label="定型明細の保存名（任意）" name="templateName" required={false} />
                <button
                  type="button"
                  disabled={!lines.length || busy}
                  onClick={(e) => {
                    const f = e.currentTarget.form!;
                    const name = new FormData(f).get('templateName');
                    run(async () => {
                      setState(await api('mutate', { action: 'template', name, lines }));
                      notify('定型明細を保存しました');
                    });
                  }}
                >
                  この明細を定型として保存
                </button>
              </div>
              {buttons}
            </form>
          )}
          {modal === 'estimateDetail' && detailEstimate && (
            <>
              <p>
                {projectName(detailEstimate.projectId)} / {detailEstimate.name}
              </p>
              <Table headings={['品番 / 品名', '数量', '仕入単価', '見積単価', '金額']}>
                {detailEstimate.lines.map((l, n) => (
                  <tr key={n}>
                    <td>
                      {l.code}
                      <small>{l.name}</small>
                    </td>
                    <td>
                      {l.quantity} {l.unit}
                    </td>
                    <td>{yen(l.cost)}</td>
                    <td>{yen(l.price)}</td>
                    <td>{yen(l.quantity * l.price)}</td>
                  </tr>
                ))}
              </Table>
              <p>
                選定代理店：{detailEstimate.supplier || '未選定'} / 送料{' '}
                {yen(detailEstimate.shipping)}
              </p>
              <div className="inline-total">
                見積金額（税込）<strong>{yen(estimateTotal(detailEstimate))}</strong>
              </div>
              <p className="caption">
                仕入参考額：{yen(estimatePurchase(detailEstimate))}
                。取り込む回答価格は仕入単価です。見積単価は作成時の販売価格を維持します。
              </p>
            </>
          )}
          {modal === 'invite' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = formObject(e.currentTarget);
                run(async () => {
                  const result = await api('invite', d);
                  setState(result.state);
                  setShare(result.url);
                  setModal('share');
                });
              }}
            >
              <Field label="依頼する見積">
                <select name="estimateId" required defaultValue={active || selectedEstimate}>
                  <option value="">見積を選択</option>
                  {state.estimates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} / {projectName(e.projectId)}
                    </option>
                  ))}
                </select>
              </Field>
              <Input label="代理店名" name="supplier" />
              <p className="caption">
                品番・品名・数量だけを公開する専用URLを発行します。他社回答は表示しません。期限は14日間です。
              </p>
              {buttons}
            </form>
          )}
          {modal === 'share' && (
            <>
              <div className="alert success">
                <Check size={20} />
                専用URLを発行しました。この画面でコピーして代理店へ送ってください。
              </div>
              <Field label="代理店専用URL">
                <input readOnly value={share} />
              </Field>
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(share);
                    notify('URLをコピーしました');
                  })
                }
              >
                <Copy size={16} />
                URLをコピー
              </button>
              <p className="caption">
                URLは秘密の回答権限を含みます。対象代理店の担当者だけに共有してください。再表示できないため、紛失時は旧URLを無効化して再発行してください。
              </p>
            </>
          )}
          {modal === 'invoice' && (
            <form onSubmit={submit('invoice', (d) => ({ ...d, amount: num(d.amount) }))}>
              <div className="form-grid">
                {projectSelect()}
                <Input label="請求番号" name="number" />
                <Input label="請求日" name="date" type="date" />
                <Input label="支払期限" name="due" type="date" />
                <Input label="今回の請求額（税込）" name="amount" type="number" min={1} />
              </div>
              <p className="caption">
                分割請求は同じ案件に複数の請求を作成してください。請求合計が契約金額を超える登録はできません。
              </p>
              {buttons}
            </form>
          )}
          {modal === 'payment' && detailInvoice && (
            <form
              onSubmit={submit('payment', (d) => ({
                ...d,
                invoiceId: active,
                amount: num(d.amount),
              }))}
            >
              <p>
                {detailInvoice.number} / 残額 {yen(detailInvoice.amount - paid(detailInvoice))}
              </p>
              <Input label="入金日" name="date" type="date" />
              <Input label="今回の入金額" name="amount" type="number" min={1} />
              {buttons}
            </form>
          )}
          {modal === 'invoiceDetail' && detailInvoice && (
            <>
              <p>
                {projectName(detailInvoice.projectId)} / {detailInvoice.number}
              </p>
              <p>
                請求日 {detailInvoice.date} / 支払期限 {detailInvoice.due}
              </p>
              <div className="inline-total">
                請求額（税込）<strong>{yen(detailInvoice.amount)}</strong>
              </div>
              <Table headings={['入金日', '入金額']}>
                {detailInvoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>{yen(p.amount)}</td>
                  </tr>
                ))}
              </Table>
              <div className="inline-total">
                未入金額<strong>{yen(detailInvoice.amount - paid(detailInvoice))}</strong>
              </div>
            </>
          )}
          {modal === 'settings' && (
            <form
              onSubmit={submit('settings', (d) => ({
                ...d,
                efficiency: num(d.efficiency),
                fuelPrice: num(d.fuelPrice),
                parking: Object.fromEntries(
                  parkingText
                    .split('\n')
                    .filter(Boolean)
                    .map((l) => {
                      const [area, value] = l.split(',');
                      return [area, num(value)];
                    }),
                ),
              }))}
            >
              <Input
                label="燃料単価（円/L）"
                name="fuelPrice"
                type="number"
                min={1}
                defaultValue={state.settings.fuelPrice}
              />
              <Input
                label="燃費（km/L）"
                name="efficiency"
                type="number"
                step="0.1"
                min={0.1}
                defaultValue={state.settings.efficiency}
              />
              <Field label="エリア別駐車料金（1行にエリア名,金額）">
                <textarea
                  rows={7}
                  required
                  value={parkingText}
                  onChange={(e) => setParkingText(e.target.value)}
                />
              </Field>
              {buttons}
            </form>
          )}
          {modal === 'user' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = formObject(e.currentTarget);
                run(async () => {
                  await api('users', d);
                  setModal('');
                  notify('社員アカウントを作成しました');
                });
              }}
            >
              <Input label="社員のメールアドレス" name="email" type="email" />
              <Input label="初期パスワード（12文字以上）" name="password" type="password" />
              <p className="caption">
                社員に安全な経路で初期パスワードを共有してください。チャットやソースコードに保存しないでください。
              </p>
              {buttons}
            </form>
          )}
          {modal === 'disableUser' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api('disable-user', formObject(e.currentTarget));
                  setModal('');
                  notify('社員アカウントを停止しました');
                });
              }}
            >
              <Input label="停止する社員メールアドレス" name="email" type="email" />
              <p className="caption">
                既存セッションも利用できなくなります。管理者はこの操作では停止できません。
              </p>
              {buttons}
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
}
function PanelTitle({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{yen(value)}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Table({ headings, children }: { headings: string[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Supplier() {
  const [data, setData] = useState<{
      supplier: string;
      expires: string;
      lines: { code: string; name: string; quantity: number; unit: string }[];
      repliedAt: string | null;
    } | null>(null),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  const secret = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
  useEffect(() => {
    api('supplier', undefined, { authorization: `Bearer ${secret}` })
      .then((d) => {
        setData(d);
        setDone(!!d.repliedAt);
      })
      .catch((e) => setError(msg(e)));
  }, [secret]);
  return (
    <div className="supplier-page">
      <div className="supplier-head">
        <Building2 size={28} />
        <strong>高岩工業</strong>
        <span>代理店 回答フォーム</span>
      </div>
      <section className="supplier-card">
        <span className="eyebrow">SUPPLIER QUOTATION</span>
        <h1>{data ? `${data.supplier} 御中` : 'お見積への回答'}</h1>
        <p>ご依頼した明細の単価・送料・納期をご入力ください。金額はすべて税込です。</p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {done ? (
          <div className="alert success">
            <Check size={22} />
            <div>
              <strong>回答を受け付けました</strong>
              <p>担当者が確認します。変更が必要な場合は担当者へご連絡ください。</p>
            </div>
          </div>
        ) : (
          data && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                const f = new FormData(e.currentTarget);
                try {
                  await api(
                    'supplier',
                    {
                      prices: data.lines.map((_, n) => num(f.get(`price${n}`))),
                      shipping: num(f.get('shipping')),
                      delivery: f.get('delivery'),
                      note: f.get('note'),
                    },
                    { authorization: `Bearer ${secret}` },
                  );
                  setDone(true);
                } catch (e) {
                  setError(msg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Table headings={['品番 / 品名', '数量', '回答単価（税込）']}>
                {data.lines.map((l, n) => (
                  <tr key={n}>
                    <td>
                      <strong>{l.code}</strong>
                      <small>{l.name}</small>
                    </td>
                    <td>
                      {l.quantity} {l.unit}
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label={`${l.code} 回答単価`}
                        min="0"
                        step="1"
                        name={`price${n}`}
                        required
                      />
                    </td>
                  </tr>
                ))}
              </Table>
              <div className="form-grid">
                <Input label="送料（税込）" name="shipping" type="number" />
                <Input label="納期（到着予定日）" name="delivery" type="date" />
              </div>
              <Field label="備考">
                <textarea name="note" rows={3} />
              </Field>
              <p className="caption">
                有効期限 {data.expires.slice(0, 10)}。送信後の変更は担当者へご連絡ください。
              </p>
              <button className="primary" disabled={busy}>
                {busy ? '送信中…' : 'この内容で回答する'}
                <ArrowUpRight size={16} />
              </button>
            </form>
          )
        )}
      </section>
      <p className="supplier-foot">
        <LockKeyhole size={14} />
        このURLで閲覧できるのは、今回の依頼明細のみです。
      </p>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  location.pathname === '/supplier' ? <Supplier /> : <App />,
);
