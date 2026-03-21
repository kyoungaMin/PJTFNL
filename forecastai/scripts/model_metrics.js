const {createClient}=require('@supabase/supabase-js');
const s=createClient('https://uzzetcrdlizgixvwzlhl.supabase.co','sb_publishable_yUKcI4X6HKyhznyiEiF-dw_xkOQ-MFB');

async function calcMetrics(modelId) {
  const {data} = await s.from('forecast_result')
    .select('p10,p50,p90,actual_qty')
    .eq('model_id', modelId)
    .not('actual_qty','is',null)
    .limit(5000);
  const rows = data || [];
  const n = rows.length;
  if (n === 0) return null;

  const errors = rows.map(r => ({
    e: Math.abs(r.p50 - r.actual_qty),
    sq: (r.p50 - r.actual_qty) ** 2,
    a: r.actual_qty, p: r.p50
  }));

  const mae = errors.reduce((s,e) => s + e.e, 0) / n;
  const rmse = Math.sqrt(errors.reduce((s,e) => s + e.sq, 0) / n);
  const mean = errors.reduce((s,e) => s + e.a, 0) / n;
  const ssTot = errors.reduce((s,e) => s + (e.a - mean) ** 2, 0);
  const ssRes = errors.reduce((s,e) => s + e.sq, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const nz = errors.filter(e => e.a !== 0);
  const mape = nz.length ? nz.reduce((s,e) => s + e.e / Math.abs(e.a), 0) / nz.length * 100 : 0;
  const totalA = nz.reduce((s,e) => s + Math.abs(e.a), 0);
  const wmape = totalA > 0 ? nz.reduce((s,e) => s + e.e, 0) / totalA * 100 : 0;

  const w5 = errors.filter(e => e.e <= 5).length;
  const tol5 = (w5 / n) * 100;
  const cov = rows.filter(r => r.actual_qty >= r.p10 && r.actual_qty <= r.p90).length / n * 100;

  // 세그먼트
  const segs = [
    {label:'대량(>=100)', f: e => e.a >= 100},
    {label:'중량(10~99)', f: e => e.a >= 10 && e.a < 100},
    {label:'소량(<10)', f: e => e.a < 10},
  ].map(seg => {
    const items = errors.filter(seg.f);
    if (items.length === 0) return {label: seg.label, n:0};
    const sN = items.length;
    const sMae = items.reduce((s,e) => s+e.e, 0) / sN;
    const sNz = items.filter(e => e.a !== 0);
    const sMape = sNz.length ? sNz.reduce((s,e) => s+e.e/Math.abs(e.a),0)/sNz.length*100 : 0;
    const sTA = sNz.reduce((s,e) => s+Math.abs(e.a),0);
    const sWmape = sTA > 0 ? sNz.reduce((s,e)=>s+e.e,0)/sTA*100 : 0;
    const sW5 = items.filter(e => e.e <= 5).length;
    return {label:seg.label, n:sN, mae:sMae.toFixed(1), mape:sMape.toFixed(1), wmape:sWmape.toFixed(1), tol5:((sW5/sN)*100).toFixed(1)};
  });

  return {model:modelId, n, mae:mae.toFixed(2), rmse:rmse.toFixed(2), r2:r2.toFixed(4), mape:mape.toFixed(1), wmape:wmape.toFixed(1), tol5:tol5.toFixed(1), coverage:cov.toFixed(1), segments:segs};
}

(async () => {
  const weekly = ['lgbm_q_v2','ridge_v1','svr_linear_v1'];
  const monthly = ['lgbm_q_monthly_v1','ridge_monthly_v1','svr_linear_monthly_v1'];

  console.log('=== WEEKLY ===');
  for (const m of weekly) {
    const r = await calcMetrics(m);
    if (r) console.log(JSON.stringify(r));
  }
  console.log('=== MONTHLY ===');
  for (const m of monthly) {
    const r = await calcMetrics(m);
    if (r) console.log(JSON.stringify(r));
  }
})();
