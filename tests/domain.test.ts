import { describe, it, expect } from 'vitest';
import { emptyState, fuelCost, laborCost, projectSummary, reportCost } from '../src/domain';
import { mutate } from '../server/mutations';
const project = (s = emptyState()) =>
  mutate(s, 'project', {
    name: '空調更新',
    customer: '山田建設',
    site: '東京都中央区',
    contract: 1000000,
  });
const report = (id: string) => ({
  projectId: id,
  date: '2026-11-11',
  president: 1,
  employees: 2,
  origin: '新宿区',
  destination: '中央区',
  distance: 25,
  roundTrip: true,
  efficiency: 10,
  fuelPrice: 175,
  area: '東京都心',
  toll: { amount: 1500, status: '実費', basis: 'ETC明細' },
  material: 50000,
});
describe('現場原価と請求の業務ルール', () => {
  it('人工単価と半日を計算する', () => {
    expect(laborCost({ president: 0.5, employees: 2 })).toBe(60000);
  });
  it('往復距離・燃費・燃料価格の根拠を保持する', () => {
    const c = fuelCost(25, true, 10, 175);
    expect(c.amount).toBe(875);
    expect(c.status).toBe('概算');
    expect(c.basis).toContain('× 2');
  });
  it('距離未取得を0円の実費に偽装しない', () =>
    expect(fuelCost(0, true, 10, 175).status).toBe('未取得'));
  it('日報の原価を案件へ自動集計する', () => {
    let s = project();
    s = mutate(s, 'report', report(s.projects[0].id));
    expect(reportCost(s.reports[0])).toBe(134775);
    const summary = projectSummary(s, s.projects[0]);
    expect(summary.profit).toBe(865225);
    expect(summary.uncertain).toBe(true);
  });
  it('設定変更が過去の日報金額を変更しない', () => {
    let s = project();
    s = mutate(s, 'report', report(s.projects[0].id));
    s = mutate(s, 'settings', { fuelPrice: 200, efficiency: 8, parking: { 地方: 100 } });
    expect(s.reports[0].parking.amount).toBe(2400);
    expect(s.reports[0].fuel.amount).toBe(875);
  });
  it('実費0円と未取得を区別する', () => {
    let s = project();
    s = mutate(s, 'report', {
      ...report(s.projects[0].id),
      toll: { amount: 0, status: '実費', basis: '高速未利用' },
    });
    expect(s.reports[0].toll).toEqual({ amount: 0, status: '実費', basis: '高速未利用' });
  });
  it('同じ日報を実費へ修正して二重計上しない', () => {
    let s = project();
    const data = report(s.projects[0].id);
    s = mutate(s, 'report', data);
    const id = s.reports[0].id;
    s = mutate(s, 'report', {
      ...data,
      id,
      fuelActual: true,
      fuelAmount: 1000,
      fuelBasis: '給油領収書',
      parkingActual: true,
      parkingAmount: 1800,
      parkingBasis: '駐車領収書',
    });
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0].fuel.status).toBe('実費');
    expect(projectSummary(s, s.projects[0]).uncertain).toBe(false);
    expect(s.reports[0].parking.amount).toBe(1800);
  });
  it('分割請求と部分入金の残額を管理する', () => {
    let s = project();
    const id = s.projects[0].id;
    for (let n = 0; n < 2; n++)
      s = mutate(s, 'invoice', {
        projectId: id,
        number: `INV-${n}`,
        date: '2026-11-11',
        due: '2026-12-10',
        amount: 400000,
      });
    s = mutate(s, 'payment', { invoiceId: s.invoices[0].id, date: '2026-11-12', amount: 100000 });
    const v = projectSummary(s, s.projects[0]);
    expect(v.billed).toBe(800000);
    expect(v.unbilled).toBe(200000);
    expect(v.unpaid).toBe(700000);
  });
  it('過請求・過入金・契約金額の不整合を拒否する', () => {
    let s = project();
    const id = s.projects[0].id;
    s = mutate(s, 'invoice', {
      projectId: id,
      number: 'A',
      date: '2026-11-11',
      due: '2026-12-10',
      amount: 1000000,
    });
    expect(() =>
      mutate(s, 'invoice', {
        projectId: id,
        number: 'B',
        date: '2026-11-11',
        due: '2026-12-10',
        amount: 1,
      }),
    ).toThrow('超えます');
    expect(() =>
      mutate(s, 'payment', { invoiceId: s.invoices[0].id, date: '2026-11-11', amount: 1000001 }),
    ).toThrow('残額');
    expect(() => mutate(s, 'status', { projectId: id, status: '完工', contract: 10 })).toThrow(
      '請求済み',
    );
  });
  it('重複請求番号を拒否する', () => {
    let s = project();
    const invoice = {
      projectId: s.projects[0].id,
      number: 'A',
      date: '2026-11-11',
      due: '2026-12-10',
      amount: 1,
    };
    s = mutate(s, 'invoice', invoice);
    expect(() => mutate(s, 'invoice', invoice)).toThrow('重複');
  });
  it.each([-1, NaN, Infinity, 0.5])('不正な円金額 %s を拒否する', (value) =>
    expect(() =>
      mutate(emptyState(), 'project', {
        name: '案件',
        customer: '顧客',
        site: '現場',
        contract: value,
      }),
    ).toThrow(),
  );
  it('存在しない案件と不正な日付を拒否する', () => {
    expect(() => mutate(emptyState(), 'report', report('unknown'))).toThrow('案件');
    const s = project();
    expect(() => mutate(s, 'report', { ...report(s.projects[0].id), date: '2026-02-30' })).toThrow(
      '日付',
    );
  });
});
