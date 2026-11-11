import { Problem, text } from './mutations';
async function json(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'user-agent': 'TakaiwaConstructionManagement/1.0', accept: 'application/json' },
  });
  if (!r.ok) throw new Problem('経路サービスが応答しません。道路距離を手入力してください', 502);
  return r.json();
}
export async function travel(origin: unknown, destination: unknown) {
  const from = text(origin, '出発地', 200),
    to = text(destination, '到着地', 200);
  const geocode = async (q: string) => {
    const results = await json(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
    );
    const first = results?.[0];
    if (!first?.geometry?.coordinates || !first.properties?.title)
      throw new Problem(
        '住所を特定できません。市区町村・番地を確認するか道路距離を手入力してください',
        422,
      );
    return {
      coordinates: first.geometry.coordinates as number[],
      title: String(first.properties.title),
    };
  };
  const a = await geocode(from),
    b = await geocode(to);
  const route = await json(
    `https://router.project-osrm.org/route/v1/driving/${a.coordinates.join(',')};${b.coordinates.join(',')}?overview=false`,
  );
  const meters = route.routes?.[0]?.distance;
  if (route.code !== 'Ok' || !Number.isFinite(meters) || meters <= 0)
    throw new Problem('道路距離を取得できません。手入力してください', 422);
  const distance = Math.round(meters / 100) / 10;
  return {
    distance,
    from: a.title,
    to: b.title,
    basis: `国土地理院の住所検索 → OSRM の自動車経路 ${distance}km（片道）。取得 ${new Date().toISOString()}。検索候補の先頭を使用するため地点を要確認。高速回避・車種・通行料金は未考慮。`,
  };
}
