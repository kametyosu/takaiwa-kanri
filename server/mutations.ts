import {
  emptyState,
  fuelCost,
  paid,
  uid,
  type State,
  type Line,
  type Cost,
  type Report,
} from '../src/domain';
export class Problem extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const text = (v: unknown, label: string, max = 500): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new Problem(`${label}を正しく入力してください`);
  return v.trim();
};
export const number = (v: unknown, label: string, max = 1e10): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max)
    throw new Problem(`${label}が不正です`);
  return v;
};
export const money = (v: unknown, label = '金額') => {
  const n = number(v, label);
  if (!Number.isInteger(n)) throw new Problem(`${label}は1円単位で入力してください`);
  return n;
};
export const date = (v: unknown, label = '日付') => {
  const s = text(v, label, 10),
    d = new Date(s);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== s
  )
    throw new Problem(`${label}が不正です`);
  return s;
};
const note = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : '');
function lines(v: unknown): Line[] {
  if (!Array.isArray(v) || !v.length || v.length > 100) throw new Problem('明細は1〜100行必要です');
  return v.map((l) => ({
    itemId: note(l.itemId),
    code: text(l.code, '品番'),
    name: text(l.name, '品名'),
    unit: text(l.unit, '単位'),
    quantity: number(l.quantity, '数量', 1e6),
    cost: money(l.cost, '仕入単価'),
    price: money(l.price, '見積単価'),
  }));
}
function cost(v: unknown, label: string): Cost {
  const c = v as Cost;
  if (!c || !['実費', '概算', '未取得'].includes(c.status))
    throw new Problem(`${label}の区分が不正です`);
  return {
    amount: c.status === '未取得' ? 0 : money(c.amount, label),
    status: c.status,
    basis: c.status === '未取得' ? '未取得・原価未確定' : text(c.basis, `${label}の根拠`, 1000),
  };
}
export function mutate(state: State, action: string, input: Record<string, unknown>): State {
  const s = structuredClone(state ?? emptyState()),
    id = uid();
  const projectId = typeof input.projectId === 'string' ? input.projectId : '';
  const project = s.projects.find((p) => p.id === projectId);
  if (['report', 'estimate', 'invoice', 'status'].includes(action) && !project)
    throw new Problem('案件が見つかりません');
  switch (action) {
    case 'project':
      s.projects.push({
        id,
        name: text(input.name, '案件名'),
        customer: text(input.customer, '得意先'),
        site: text(input.site, '現場'),
        status: '見積中',
        contract: money(input.contract, '契約金額'),
      });
      break;
    case 'status': {
      if (!['見積中', '受注', '完工', '失注'].includes(String(input.status)))
        throw new Problem('案件状態が不正です');
      const contract = money(input.contract, '契約金額');
      if (
        s.invoices.filter((i) => i.projectId === projectId).reduce((a, i) => a + i.amount, 0) >
        contract
      )
        throw new Problem('契約金額は請求済み合計以上にしてください');
      project!.status = input.status as '見積中' | '受注' | '完工' | '失注';
      project!.contract = contract;
      break;
    }
    case 'item':
      s.items.push({
        id,
        code: text(input.code, '品番'),
        name: text(input.name, '品名'),
        unit: text(input.unit, '単位'),
        price: money(input.price, '標準単価'),
      });
      break;
    case 'template':
      s.templates.push({ id, name: text(input.name, '定型明細名'), lines: lines(input.lines) });
      break;
    case 'estimate':
      s.estimates.push({
        id,
        projectId,
        name: text(input.name, '見積名'),
        lines: lines(input.lines),
        shipping: money(input.shipping, '送料'),
        supplier: '',
      });
      break;
    case 'report': {
      const existing = input.id ? s.reports.find((r) => r.id === input.id) : undefined;
      if (input.id && !existing) throw new Problem('日報が見つかりません');
      const distance = number(input.distance, '片道道路距離', 10000),
        efficiency = number(input.efficiency, '燃費', 100),
        fuelPrice = money(input.fuelPrice, '燃料単価');
      if (efficiency <= 0 || fuelPrice <= 0)
        throw new Problem('燃費と燃料単価は0より大きくしてください');
      const area = text(input.area, '駐車エリア');
      if (!(area in s.settings.parking)) throw new Problem('駐車エリアが不正です');
      const fuel =
        input.fuelActual === true
          ? cost({ amount: input.fuelAmount, status: '実費', basis: input.fuelBasis }, '燃料費')
          : fuelCost(distance, input.roundTrip === true, efficiency, fuelPrice);
      const parking =
        input.parkingActual === true
          ? cost(
              { amount: input.parkingAmount, status: '実費', basis: input.parkingBasis },
              '駐車料金',
            )
          : {
              amount: s.settings.parking[area],
              status: '概算' as const,
              basis: `${area}のエリア別1日設定額`,
            };
      let toll = cost(input.toll, '高速料金');
      let tollRate: number | undefined, tollFixed: number | undefined;
      if (toll.status === '概算') {
        if (!distance) throw new Problem('高速料金の概算には道路距離を入力してください');
        tollRate = number(input.tollRate, '高速概算単価', 10000);
        tollFixed = money(input.tollFixed, '高速概算固定額');
        const km = distance * (input.roundTrip === true ? 2 : 1);
        toll = {
          status: '概算',
          amount: money(Math.round(km * tollRate + tollFixed), '高速概算額'),
          basis: `${km}km × ${tollRate}円/km ＋ ${tollFixed}円。入力道路距離全体に対する簡易モデル。車種・IC・割引は未反映。公式料金ではありません。`,
        };
      }
      const r: Report = {
        id: existing?.id ?? id,
        projectId,
        tollRate,
        tollFixed,
        date: date(input.date),
        president: number(input.president, '社長人工', 100),
        employees: number(input.employees, '社員人工', 100),
        origin: text(input.origin, '出発地'),
        destination: text(input.destination, '到着地'),
        distance,
        distanceBasis: note(input.distanceBasis) || '手入力の道路距離。経路・距離を要確認。',
        roundTrip: input.roundTrip === true,
        efficiency,
        fuelPrice,
        area,
        fuel,
        toll,
        parking,
        material: money(input.material, '材料・その他実費'),
        note: note(input.note),
      };
      if (existing) s.reports[s.reports.findIndex((v) => v.id === existing.id)] = r;
      else s.reports.push(r);
      break;
    }
    case 'invoice': {
      if (project!.status === '失注') throw new Problem('失注案件には請求できません');
      const amount = money(input.amount, '請求金額');
      if (!amount) throw new Problem('請求金額は1円以上です');
      const billed = s.invoices
        .filter((i) => i.projectId === projectId)
        .reduce((a, i) => a + i.amount, 0);
      if (billed + amount > project!.contract)
        throw new Problem('請求合計が契約金額を超えます。契約金額を先に更新してください');
      const issued = date(input.date),
        due = date(input.due, '支払期限');
      if (due < issued) throw new Problem('支払期限は請求日以降にしてください');
      const invoiceNumber = text(input.number, '請求番号');
      if (s.invoices.some((i) => i.number === invoiceNumber))
        throw new Problem('請求番号が重複しています');
      s.invoices.push({
        id,
        projectId,
        number: invoiceNumber,
        date: issued,
        due,
        amount,
        payments: [],
      });
      break;
    }
    case 'payment': {
      const i = s.invoices.find((i) => i.id === input.invoiceId);
      if (!i) throw new Problem('請求が見つかりません');
      const amount = money(input.amount, '入金額');
      if (!amount || paid(i) + amount > i.amount) throw new Problem('入金額は残額以内の正数です');
      i.payments.push({ id, date: date(input.date), amount });
      break;
    }
    case 'selectSupplier': {
      const i = s.invitations.find((i) => i.id === input.inviteId),
        e = s.estimates.find((e) => e.id === i?.estimateId);
      if (!i || !e || !i.prices || i.revoked) throw new Problem('有効な代理店回答がありません');
      if (e.lines.length !== i.prices.length) throw new Problem('依頼明細が一致しません');
      e.lines = e.lines.map((l, n) => ({ ...l, cost: i.prices![n] }));
      e.shipping = i.shipping ?? 0;
      e.supplier = i.supplier;
      e.inviteId = i.id;
      break;
    }
    case 'revoke': {
      const i = s.invitations.find((i) => i.id === input.inviteId);
      if (!i) throw new Problem('依頼が見つかりません');
      i.revoked = true;
      break;
    }
    case 'settings': {
      const parking = input.parking;
      if (!parking || typeof parking !== 'object' || Array.isArray(parking))
        throw new Problem('駐車設定が不正です');
      const entries = Object.entries(parking);
      if (!entries.length || entries.length > 30) throw new Problem('駐車エリアは1〜30件です');
      const efficiency = number(input.efficiency, '燃費', 100),
        fuelPrice = money(input.fuelPrice, '燃料単価');
      if (!efficiency || !fuelPrice) throw new Problem('燃費・燃料単価は正数です');
      s.settings = {
        fuelPrice,
        efficiency,
        parking: Object.fromEntries(
          entries.map(([k, v]) => [text(k, 'エリア', 50), money(v, '駐車料金')]),
        ),
      };
      break;
    }
    default:
      throw new Problem('操作が不正です');
  }
  return s;
}
