export type CostStatus = '概算' | '未取得' | '実費';
export type Project = {
  id: string;
  name: string;
  customer: string;
  site: string;
  status: '見積中' | '受注' | '完工' | '失注';
  contract: number;
};
export type Cost = { amount: number; status: CostStatus; basis: string };
export type Report = {
  id: string;
  projectId: string;
  date: string;
  president: number;
  employees: number;
  origin: string;
  destination: string;
  distance: number;
  distanceBasis: string;
  tollRate?: number;
  tollFixed?: number;
  roundTrip: boolean;
  efficiency: number;
  fuelPrice: number;
  area: string;
  fuel: Cost;
  toll: Cost;
  parking: Cost;
  material: number;
  note: string;
};
export type Item = { id: string; code: string; name: string; unit: string; price: number };
export type Line = {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  cost: number;
  price: number;
};
export type Estimate = {
  id: string;
  projectId: string;
  name: string;
  lines: Line[];
  shipping: number;
  supplier: string;
  inviteId?: string;
};
export type Template = { id: string; name: string; lines: Line[] };
export type Invitation = {
  id: string;
  projectId: string;
  estimateId: string;
  supplier: string;
  expires: string;
  lines: Line[];
  prices: number[] | null;
  shipping: number | null;
  delivery: string;
  note: string;
  repliedAt: string | null;
  revoked: boolean;
  url?: string;
};
export type Invoice = {
  id: string;
  projectId: string;
  number: string;
  date: string;
  due: string;
  amount: number;
  payments: { id: string; date: string; amount: number }[];
};
export type Settings = { fuelPrice: number; efficiency: number; parking: Record<string, number> };
export type State = {
  projects: Project[];
  reports: Report[];
  items: Item[];
  templates: Template[];
  estimates: Estimate[];
  invitations: Invitation[];
  invoices: Invoice[];
  settings: Settings;
};
export const emptyState = (): State => ({
  projects: [],
  reports: [],
  items: [],
  templates: [],
  estimates: [],
  invitations: [],
  invoices: [],
  settings: {
    fuelPrice: 175,
    efficiency: 10,
    parking: { 東京都心: 2400, 東京その他: 1500, 神奈川: 1200, その他: 1000 },
  },
});
export const yen = (n: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
export const laborCost = (r: Pick<Report, 'president' | 'employees'>) =>
  Math.round(r.president * 40000 + r.employees * 20000);
export function fuelCost(
  distance: number,
  roundTrip: boolean,
  efficiency: number,
  price: number,
): Cost {
  if (!Number.isFinite(distance) || distance <= 0)
    return {
      amount: 0,
      status: '未取得',
      basis: '道路距離が未入力です。経路検索の走行距離を入力してください。',
    };
  if (efficiency <= 0 || price <= 0) throw new Error('燃費・燃料単価は正数で入力してください');
  const km = distance * (roundTrip ? 2 : 1);
  return {
    amount: Math.round((km / efficiency) * price),
    status: '概算',
    basis: `${distance}km（片道）× ${roundTrip ? 2 : 1} ÷ ${efficiency}km/L × ${price}円/L。入力道路距離に基づく概算。`,
  };
}
export const reportCost = (r: Report) =>
  laborCost(r) + r.fuel.amount + r.toll.amount + r.parking.amount + r.material;
export const estimateTotal = (e: Estimate) =>
  e.lines.reduce((s, l) => s + l.quantity * l.price, 0) + e.shipping;
export const estimatePurchase = (e: Estimate) =>
  e.lines.reduce((s, l) => s + l.quantity * l.cost, 0) + e.shipping;
export const paid = (i: Invoice) => i.payments.reduce((s, p) => s + p.amount, 0);
export function projectSummary(s: State, p: Project) {
  const reports = s.reports.filter((r) => r.projectId === p.id),
    invoices = s.invoices.filter((i) => i.projectId === p.id);
  const cost = reports.reduce((a, r) => a + reportCost(r), 0),
    billed = invoices.reduce((a, i) => a + i.amount, 0),
    received = invoices.reduce((a, i) => a + paid(i), 0);
  return {
    cost,
    profit: p.contract - cost,
    margin: p.contract > 0 ? ((p.contract - cost) / p.contract) * 100 : 0,
    billed,
    received,
    unbilled: Math.max(0, p.contract - billed),
    unpaid: billed - received,
    uncertain: reports.some((r) => [r.fuel, r.toll, r.parking].some((c) => c.status !== '実費')),
  };
}
export const uid = () => crypto.randomUUID();
