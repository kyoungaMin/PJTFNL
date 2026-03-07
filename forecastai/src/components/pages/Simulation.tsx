'use client'
import React, { useState, useMemo, useEffect } from 'react'
import { AreaChart, Area, ComposedChart, Bar, BarChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { T, card, SIM_SKUS, SIM_CUSTOMERS, SIM_PERIODS, AI_PRESETS, runSimulation,
  INDUSTRY_SCENARIOS, CATEGORY_COLORS, RADAR_AXES, SENSITIVITY_VARIABLES, SENSITIVITY_KPIS,
  calcRadarScores, runSensitivity } from '@/lib/data'
import { PageHeader, Btn } from '@/components/ui'

/* ─── Inline helpers ───────────────────────────────────────────────────────── */
const mono = "'IBM Plex Mono',monospace"
const fmt = (n:number) => n.toLocaleString()

function SimSlider({ label, value, onChange, min, max, step=1, unit='', color=T.blue }:
  {label:string,value:number,onChange:(v:number)=>void,min:number,max:number,step?:number,unit?:string,color?:string}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color:T.text2 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:800, color, fontFamily:mono }}>{value > 0 && '+'}{value}{unit}</span>
      </div>
      <div style={{ position:'relative', height:6, background:T.surface2, borderRadius:3, cursor:'pointer' }}>
        <div style={{ position:'absolute', left:0, width:`${pct}%`, height:'100%', background:color, borderRadius:3 }}/>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', left:0, width:'100%', height:20, opacity:0, cursor:'pointer', margin:0 }}/>
        <div style={{ position:'absolute', top:'50%', left:`${pct}%`, transform:'translate(-50%,-50%)', width:14, height:14, borderRadius:'50%', background:color, border:'2px solid white', boxShadow:'0 1px 4px rgba(0,0,0,0.2)', pointerEvents:'none' }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
        <span style={{ fontSize:9, color:T.text3 }}>{min}{unit}</span>
        <span style={{ fontSize:9, color:T.text3 }}>{max}{unit}</span>
      </div>
    </div>
  )
}

function SimResultCard({ label, value, sub, color=T.blue, icon }:
  {label:string,value:string,sub:string,color?:string,icon:string}) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 18px', borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>{icon} {label}</div>
      <div style={{ fontSize:20, fontWeight:800, color, fontFamily:mono, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:T.text2, marginTop:5 }}>{sub}</div>
    </div>
  )
}

/* ─── Tab constants ─────────────────────────────────────────────────────────── */
const TABS = [
  { id:'simulation'  as const, label:'시나리오 시뮬레이션', icon:'⚙' },
  { id:'comparison'  as const, label:'시나리오 비교',       icon:'📊' },
  { id:'sensitivity' as const, label:'민감도 분석',         icon:'🎯' },
]
type TabId = typeof TABS[number]['id']

const SCENARIO_COLORS = [T.blue, T.green, T.purple]

type SavedScenario = {
  id: string; name: string; color: string;
  params: { demandDelta:number, productionDelta:number, safetyBuffer:number, orderQty:number, leadTimeDelta:number };
  skuId: string; simData: {w:string,asis:number,tobe:number,safe:number}[];
  radar: Record<string,number>;
  kpis: { finalStock:number, stockoutWeeks:number, costDelta:number, deliveryRate:number };
}

type CustomerItem = { id:string, name:string }
type SkuItem = { id:string, name:string, spec?:string, safeStock:number, currentStock:number, leadTime:number, weeklyDemand:number, productionCap:number, customers?:CustomerItem[] }

/* ══════════════════════════════════════════════════════════════════════════════ */
export default function PageSimulation() {
  const [activeTab, setActiveTab] = useState<TabId>('simulation')

  /* ── Data source state ── */
  const [skuList, setSkuList] = useState<SkuItem[]>(SIM_SKUS)
  const [customerList, setCustomerList] = useState<CustomerItem[]>([])
  const [dataSource, setDataSource] = useState<'loading'|'database'|'mock'>('loading')
  const [planDate, setPlanDate] = useState<string|null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/simulation-skus')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.source === 'database' && data.skus?.length > 0) {
          setSkuList(data.skus)
          setSelectedSku(data.skus[0])
          setDataSource('database')
          setPlanDate(data.planDate ?? null)
          if (data.customers?.length > 0) setCustomerList(data.customers)
        } else {
          setSkuList(SIM_SKUS)
          setSelectedSku(SIM_SKUS[0])
          setDataSource('mock')
        }
      })
      .catch(() => {
        if (cancelled) return
        setSkuList(SIM_SKUS)
        setSelectedSku(SIM_SKUS[0])
        setDataSource('mock')
      })
    return () => { cancelled = true }
  }, [])

  /* ── Simulation state ── */
  const [selectedSku, setSelectedSku] = useState<SkuItem>(SIM_SKUS[0])
  const [customer, setCustomer] = useState('전체 고객사')
  const [period, setPeriod] = useState(8)
  const [activePreset, setActivePreset] = useState<string|null>(null)
  const [appliedPreset, setAppliedPreset] = useState(false)
  const [showIndustry, setShowIndustry] = useState(false)

  const [demandDelta, setDemandDelta] = useState(0)
  const [productionDelta, setProductionDelta] = useState(0)
  const [safetyBuffer, setSafetyBuffer] = useState(0)
  const [orderQty, setOrderQty] = useState(0)
  const [leadTimeDelta, setLeadTimeDelta] = useState(0)

  /* ── Comparison state ── */
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [scenarioName, setScenarioName] = useState('')

  /* ── Sensitivity state ── */
  const [targetKpi, setTargetKpi] = useState('finalStock')

  /* ── Computed ── */
  const params = { demandDelta, productionDelta, safetyBuffer, orderQty, leadTimeDelta }
  const simData = runSimulation(selectedSku, params, period)
  const zeroWeeks = simData.filter(d => d.asis <= 0).length
  const tobeZeroWeeks = simData.filter(d => d.tobe <= 0).length
  const lastTobe = simData[simData.length-1]?.tobe ?? 0
  const lastAsis = simData[simData.length-1]?.asis ?? 0
  const safeStock = Math.round(selectedSku.safeStock * (1 + safetyBuffer/100))
  const stockoutElim = zeroWeeks > 0 && tobeZeroWeeks === 0
  const costSaving = Math.round(Math.abs(productionDelta) * selectedSku.productionCap * 800)

  const sensitivityData = useMemo(() =>
    runSensitivity(selectedSku, params, period, targetKpi),
    [selectedSku.id, demandDelta, productionDelta, safetyBuffer, orderQty, leadTimeDelta, period, targetKpi]
  )

  /* ── Actions ── */
  const applyPreset = (preset: {id:string, params:typeof params}) => {
    setActivePreset(preset.id)
    const p = preset.params
    setDemandDelta(p.demandDelta); setProductionDelta(p.productionDelta)
    setSafetyBuffer(p.safetyBuffer); setOrderQty(p.orderQty); setLeadTimeDelta(p.leadTimeDelta)
    setAppliedPreset(true); setTimeout(() => setAppliedPreset(false), 2000)
  }
  const resetParams = () => {
    setDemandDelta(0); setProductionDelta(0); setSafetyBuffer(0)
    setOrderQty(0); setLeadTimeDelta(0); setActivePreset(null)
  }
  const saveScenario = () => {
    if (savedScenarios.length >= 3 || !scenarioName.trim()) return
    const color = SCENARIO_COLORS[savedScenarios.length]
    const radar = calcRadarScores(selectedSku, params, period)
    const sd = runSimulation(selectedSku, params, period)
    const twz = sd.filter(d => d.tobe <= 0).length
    const last = sd[sd.length-1]?.tobe ?? 0
    setSavedScenarios(prev => [...prev, {
      id: Date.now().toString(), name: scenarioName.trim(), color,
      params: {...params}, skuId: selectedSku.id, simData: sd, radar,
      kpis: { finalStock: last, stockoutWeeks: twz,
        costDelta: Math.abs(params.productionDelta) * selectedSku.productionCap * 800 + params.orderQty * 500,
        deliveryRate: twz === 0 ? 95 : twz <= 1 ? 82 : 63 }
    }])
    setScenarioName('')
  }
  const deleteScenario = (id: string) => {
    setSavedScenarios(prev => {
      const updated = prev.filter(s => s.id !== id)
      return updated.map((s,i) => ({...s, color: SCENARIO_COLORS[i]}))
    })
  }

  /* ── Tooltips ── */
  const SimBarTooltip = ({active, payload, label}: any) => {
    if (!active || !payload?.length) return null
    const asis = payload.find((p:any)=>p.dataKey==='asis')?.value
    const tobe = payload.find((p:any)=>p.dataKey==='tobe')?.value
    return (
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:'10px 14px',boxShadow:'0 4px 12px rgba(15,23,42,0.1)'}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:5,fontWeight:600}}>{label}</div>
        <div style={{fontSize:12,color:'#94A3B8',fontWeight:600}}>현재 계획: {asis?.toLocaleString()} EA</div>
        <div style={{fontSize:12,color:tobe<safeStock?T.red:T.blue,fontWeight:700}}>시나리오: {tobe?.toLocaleString()} EA {tobe<safeStock?'⚠ 안전재고 미달':''}</div>
        <div style={{fontSize:11,color:T.text3,marginTop:3}}>안전재고선: {safeStock.toLocaleString()} EA</div>
      </div>
    )
  }

  const presetColors: Record<string,{c:string,bg:string,b:string}> = {
    red:{c:T.red,bg:T.redSoft,b:T.redMid}, blue:{c:T.blue,bg:T.blueSoft,b:T.blueMid}, amber:{c:T.amber,bg:T.amberSoft,b:T.amberMid},
    green:{c:T.green,bg:T.greenSoft,b:T.greenMid}, orange:{c:T.orange,bg:T.orangeSoft,b:T.orangeMid}, purple:{c:T.purple,bg:T.purpleSoft,b:T.purpleMid},
  }

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div>
      <PageHeader title="시나리오 분석"
        sub={<span>시나리오 시뮬레이션 · 멀티 시나리오 비교 · 민감도 분석{' '}
          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,marginLeft:6,
            background:dataSource==='database'?T.greenSoft:dataSource==='loading'?T.surface2:T.amberSoft,
            color:dataSource==='database'?T.green:dataSource==='loading'?T.text3:T.amber,
            border:`1px solid ${dataSource==='database'?T.greenMid:dataSource==='loading'?T.border:T.amberMid}`}}>
            {dataSource==='database'?`DB 실데이터 · ${planDate} · ${skuList.length}개 SKU`
              :dataSource==='loading'?'불러오는 중...':`Mock 데이터 · ${skuList.length}개 SKU`}
          </span>
        </span>}
        action={
          <div style={{display:'flex',gap:8}}>
            <Btn variant="secondary" onClick={resetParams}>↺ 초기화</Btn>
            {activeTab === 'simulation' && <Btn onClick={() => setActiveTab('comparison')}>📊 비교 탭으로</Btn>}
          </div>
        }/>

      {/* ── Tab Bar ── */}
      <div style={{display:'flex',gap:4,marginBottom:20,background:T.surface2,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{flex:1,padding:'10px 0',fontSize:13,fontWeight:activeTab===tab.id?700:500,borderRadius:8,
              border:activeTab===tab.id?`1px solid ${T.blue}`:'1px solid transparent',
              background:activeTab===tab.id?T.surface:'transparent',
              color:activeTab===tab.id?T.blue:T.text2,cursor:'pointer',transition:'all 0.15s',
              boxShadow:activeTab===tab.id?'0 1px 4px rgba(37,99,235,0.12)':'none'}}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB 1: 시나리오 시뮬레이션 ═══════════════ */}
      {activeTab === 'simulation' && (
        <div>
          {/* ── 산업 시나리오 템플릿 ── */}
          <div style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:'0.07em',textTransform:'uppercase'}}>🏭 산업 시나리오 템플릿</div>
              <button onClick={() => setShowIndustry(!showIndustry)}
                style={{fontSize:11,color:T.blue,background:'none',border:'none',cursor:'pointer',fontWeight:600}}>
                {showIndustry ? '접기 ▲' : '펼치기 ▼'} ({INDUSTRY_SCENARIOS.length}개)
              </button>
            </div>
            {showIndustry && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                {INDUSTRY_SCENARIOS.map(sc => {
                  const cc = CATEGORY_COLORS[sc.category] ?? presetColors.blue
                  const pc = presetColors[sc.badgeColor]
                  const isActive = activePreset === sc.id
                  return (
                    <div key={sc.id} onClick={() => applyPreset(sc)}
                      style={{background:isActive?pc.bg:T.surface,border:`1px solid ${isActive?pc.c:T.border}`,
                        borderRadius:10,padding:'12px 14px',cursor:'pointer',transition:'all 0.15s',
                        boxShadow:isActive?`0 0 0 2px ${pc.c}30`:'none'}}
                      onMouseEnter={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background=T.surface2}}
                      onMouseLeave={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background=T.surface}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:isActive?pc.c:T.text1}}>{sc.icon} {sc.label}</span>
                        <span style={{fontSize:9,fontWeight:700,color:cc.c,background:cc.bg,border:`1px solid ${cc.b}`,borderRadius:4,padding:'1px 6px'}}>{sc.category}</span>
                      </div>
                      <div style={{fontSize:10,color:T.text2,lineHeight:1.5,marginBottom:6}}>{sc.desc}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:4}}>
                        {[
                          sc.params.demandDelta !== 0 ? {l:'수요',v:`${sc.params.demandDelta>0?'+':''}${sc.params.demandDelta}%`,c:sc.params.demandDelta>0?T.red:T.blue} : null,
                          sc.params.productionDelta !== 0 ? {l:'생산',v:`${sc.params.productionDelta>0?'+':''}${sc.params.productionDelta}%`,c:sc.params.productionDelta>0?T.green:T.red} : null,
                          sc.params.safetyBuffer > 0 ? {l:'안전재고',v:`+${sc.params.safetyBuffer}%`,c:T.purple} : null,
                          sc.params.orderQty > 0 ? {l:'발주',v:`${sc.params.orderQty.toLocaleString()}EA`,c:T.orange} : null,
                          sc.params.leadTimeDelta !== 0 ? {l:'리드타임',v:`${sc.params.leadTimeDelta>0?'+':''}${sc.params.leadTimeDelta}일`,c:T.amber} : null,
                        ].filter((t): t is {l:string,v:string,c:string} => t !== null).map((tag,ti) => (
                          <span key={ti} style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,
                            background:`${tag.c}12`,color:tag.c,border:`1px solid ${tag.c}30`}}>
                            {tag.l} {tag.v}
                          </span>
                        ))}
                      </div>
                      {isActive && <div style={{marginTop:4,fontSize:10,color:pc.c,fontWeight:600}}>✓ 적용됨</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── AI 권고 프리셋 ── */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:10}}>🤖 AI 권고 시나리오</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {AI_PRESETS.map(preset => {
                const pc = presetColors[preset.badgeColor]
                const isActive = activePreset===preset.id
                return (
                  <div key={preset.id} onClick={() => applyPreset(preset)}
                    style={{background:isActive?pc.bg:T.surface,border:`1px solid ${isActive?pc.c:T.border}`,borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'all 0.15s',boxShadow:isActive?`0 0 0 2px ${pc.c}30`:'none'}}
                    onMouseEnter={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background=T.surface2}}
                    onMouseLeave={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background=T.surface}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                      <span style={{fontSize:12,fontWeight:700,color:isActive?pc.c:T.text1}}>{preset.label}</span>
                      <span style={{fontSize:10,fontWeight:700,color:pc.c,background:pc.bg,border:`1px solid ${pc.b}`,borderRadius:4,padding:'2px 7px'}}>{preset.badge}</span>
                    </div>
                    <div style={{fontSize:11,color:T.text2,lineHeight:1.6}}>{preset.desc}</div>
                    {isActive && <div style={{marginTop:8,fontSize:11,color:pc.c,fontWeight:600}}>✓ 적용됨 — 아래 슬라이더에 반영되었습니다</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:16,alignItems:'start'}}>
            {/* ── LEFT: 파라미터 패널 ── */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:20,boxShadow:'0 1px 4px rgba(15,23,42,0.07)'}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:16}}>⚙ 시나리오 변수</div>

              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>분석 SKU</div>
                <select value={selectedSku.id} onChange={e=>setSelectedSku(skuList.find(s=>s.id===e.target.value) ?? skuList[0])}
                  style={{width:'100%',fontSize:12,color:T.text1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:'7px 10px',outline:'none'}}>
                  {skuList.map(s=><option key={s.id} value={s.id}>{s.id} — {s.name}{s.spec ? ` (${s.spec})` : ''}</option>)}
                </select>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>고객사</div>
                <select value={customer} onChange={e=>setCustomer(e.target.value)}
                  style={{width:'100%',fontSize:12,color:T.text1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:'7px 10px',outline:'none'}}>
                  <option value="전체 고객사">전체 고객사</option>
                  {(customerList.length > 0 ? customerList : SIM_CUSTOMERS.slice(1).map(c=>({id:c,name:c}))).map(c=>
                    <option key={c.id} value={c.id}>{c.name}</option>
                  )}
                </select>
              </div>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>시뮬레이션 기간</div>
                <div style={{display:'flex',gap:6}}>
                  {SIM_PERIODS.map(w=>(
                    <button key={w} onClick={()=>setPeriod(w)}
                      style={{flex:1,padding:'6px 0',fontSize:12,fontWeight:600,borderRadius:6,border:`1px solid ${period===w?T.blue:T.border}`,background:period===w?T.blueSoft:'transparent',color:period===w?T.blue:T.text2,cursor:'pointer'}}>
                      {w}주
                    </button>
                  ))}
                </div>
              </div>

              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16,marginBottom:4}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:14}}>수요 / 생산 변수</div>
              </div>
              <SimSlider label="수요 변동률" value={demandDelta} onChange={setDemandDelta} min={-30} max={50} unit="%" color={T.blue}/>
              <SimSlider label="생산량 조정" value={productionDelta} onChange={setProductionDelta} min={-30} max={50} unit="%" color={T.green}/>

              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16,marginBottom:4}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:14}}>재고 / 발주 변수</div>
              </div>
              <SimSlider label="안전재고 버퍼" value={safetyBuffer} onChange={setSafetyBuffer} min={0} max={50} unit="%" color={T.purple}/>
              <SimSlider label="추가 발주량" value={orderQty} onChange={setOrderQty} min={0} max={5000} step={100} unit=" EA" color={T.orange}/>
              <SimSlider label="리드타임 조정" value={leadTimeDelta} onChange={setLeadTimeDelta} min={-7} max={14} unit="일" color={T.amber}/>

              {/* 현재 SKU 기준값 */}
              <div style={{marginTop:16,padding:'10px 12px',background:T.surface2,borderRadius:8,fontSize:11,color:T.text2}}>
                <div style={{fontWeight:700,color:T.text1,marginBottom:6}}>현재 기준값</div>
                {([['현재 재고',`${fmt(selectedSku.currentStock)} EA`],['안전재고',`${fmt(safeStock)} EA`],
                  ['주 생산능력',`${fmt(selectedSku.productionCap)} EA`],['주간 수요',`${fmt(selectedSku.weeklyDemand)} EA`],
                  ['리드타임',`${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일`]] as [string,string][]).map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{color:T.text3}}>{k}</span>
                    <span style={{fontWeight:600,fontFamily:mono}}>{v}</span>
                  </div>
                ))}
              </div>

              {/* 시나리오 저장 */}
              <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:16}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text1,marginBottom:8}}>💾 시나리오 저장</div>
                <div style={{display:'flex',gap:6}}>
                  <input placeholder="시나리오 이름" value={scenarioName} onChange={e=>setScenarioName(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')saveScenario()}}
                    style={{flex:1,fontSize:11,padding:'6px 10px',border:`1px solid ${T.border}`,borderRadius:6,outline:'none',background:T.surface2,color:T.text1}}/>
                  <button onClick={saveScenario} disabled={savedScenarios.length>=3||!scenarioName.trim()}
                    style={{fontSize:11,fontWeight:700,padding:'6px 12px',borderRadius:6,border:'none',
                      background:savedScenarios.length>=3?T.surface2:T.blue,color:savedScenarios.length>=3?T.text3:'white',cursor:savedScenarios.length>=3?'not-allowed':'pointer'}}>
                    저장
                  </button>
                </div>
                {savedScenarios.length > 0 && (
                  <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
                    {savedScenarios.map(s=>(
                      <div key={s.id} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,padding:'3px 8px',background:T.surface2,borderRadius:5,border:`1px solid ${T.border}`}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:s.color}}/>
                        <span style={{color:T.text2}}>{s.name}</span>
                        <button onClick={()=>deleteScenario(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:T.text3,fontSize:12,padding:0,lineHeight:1}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {savedScenarios.length >= 3 && <div style={{fontSize:10,color:T.amber,marginTop:4}}>최대 3개 저장 가능</div>}
              </div>
            </div>

            {/* ── RIGHT: 결과 영역 ── */}
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {/* 결과 KPI 카드 */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                <SimResultCard icon="📦" label="시나리오 후 재고" value={fmt(lastTobe)} sub={`현재 계획 대비 ${((lastTobe-lastAsis)/Math.max(Math.abs(lastAsis),1)*100).toFixed(1)}%`} color={lastTobe>=safeStock?T.green:T.red}/>
                <SimResultCard icon="⚠" label="결품 예상 주차" value={tobeZeroWeeks===0?'없음':`${tobeZeroWeeks}주`} sub={zeroWeeks>0?`현재계획 ${zeroWeeks}주 결품`:'현재계획도 안전'} color={tobeZeroWeeks===0?T.green:T.red}/>
                <SimResultCard icon="💰" label="예상 비용 변화" value={productionDelta===0?'변동없음':productionDelta>0?`+₩${(costSaving/1000).toFixed(0)}K`:`-₩${(costSaving/1000).toFixed(0)}K`} sub={productionDelta>0?'생산비 증가':'보관비 절감 예상'} color={productionDelta>=0?T.amber:T.green}/>
                <SimResultCard icon="✅" label="납기준수율 예측" value={tobeZeroWeeks===0?'95%+':tobeZeroWeeks<=1?'82%':'63%'} sub="시나리오 기준 추정치" color={tobeZeroWeeks===0?T.green:T.amber}/>
              </div>

              {/* AS-IS vs TO-BE 바 차트 */}
              <div style={{...card}}>
                <div style={{marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text1}}>재고 수준 비교 (AS-IS vs TO-BE)</div>
                  <div style={{fontSize:11,color:T.text3,marginTop:2}}>현재 계획(AS-IS) 대비 시나리오 적용 후(TO-BE)의 재고 수준 변화</div>
                </div>
                <div style={{display:'flex',gap:20,marginTop:10,marginBottom:14,fontSize:11,color:T.text2}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,borderRadius:2,background:'#CBD5E1'}}/> 현재 계획</div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,borderRadius:2,background:T.blue}}/> 시나리오 적용</div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}><svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke={T.red} strokeWidth={1.5} strokeDasharray="4 2"/></svg> 안전 재고선</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={simData} margin={{top:4,right:8,left:0,bottom:0}} barGap={4} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                    <XAxis dataKey="w" tick={{fontSize:11,fill:T.text3}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={40} tickFormatter={(v:number)=>v>=1000?`${(v/1000).toFixed(1)}k`:String(v)}/>
                    <Tooltip content={<SimBarTooltip/>}/>
                    <Bar dataKey="asis" name="현재 계획" fill="#CBD5E1" radius={[3,3,0,0]}>
                      {simData.map((_,i)=><Cell key={`a-${i}`} fill="#CBD5E1"/>)}
                    </Bar>
                    <Bar dataKey="tobe" name="시나리오 적용" radius={[3,3,0,0]}>
                      {simData.map((entry,i)=><Cell key={`t-${i}`} fill={entry.tobe<entry.safe?'#FCA5A5':T.blue}/>)}
                    </Bar>
                    <ReferenceLine y={safeStock} stroke={T.red} strokeDasharray="5 3" strokeWidth={1.5}
                      label={{value:`안전재고 ${fmt(safeStock)}EA`,position:'insideTopRight',fontSize:9,fill:T.red,dy:-2} as any}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* P10/P50/P90 수요 밴드 */}
              <div style={{...card}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>수요 시나리오 예측 밴드 (P10 / P50 / P90)</div>
                <div style={{fontSize:11,color:T.text3,marginBottom:14}}>전체 시나리오 변수 반영 · 주차별 불확실성 확대</div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={simData.map((d,i)=>{
                    const base = selectedSku.weeklyDemand*(1+demandDelta/100)
                    // 주차별 수요 트렌드: 수요 증가 시나리오면 우상향, 감소면 우하향
                    const trend = 1 + (demandDelta!==0 ? Math.sign(demandDelta)*0.018 : 0) * i
                    // 계절 변동성 (±5%)
                    const seasonal = 1 + 0.05 * Math.sin(i * 0.9 + 0.3)
                    // 생산/안전재고 버퍼가 수요 압력에 미치는 영향
                    const supplyPressure = 1 + (productionDelta < 0 ? Math.abs(productionDelta)*0.003 : -productionDelta*0.001) * Math.min(i, 4)
                    const bufferEffect = 1 + safetyBuffer * 0.001 * i
                    const weeklyP50 = Math.round(base * trend * seasonal * supplyPressure * bufferEffect)
                    // 불확실성: 시간↑, 리드타임↑, 변동폭↑일수록 밴드 확대
                    const unc = 0.06 + i*0.025 + Math.abs(leadTimeDelta)*0.008 + Math.abs(demandDelta)*0.001 + (orderQty>0 ? 0.02 : 0)
                    return {...d, p50:weeklyP50, p10:Math.round(weeklyP50*(1-unc)), p90:Math.round(weeklyP50*(1+unc*1.4))}
                  })} margin={{top:4,right:8,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id="simBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.blue} stopOpacity={0.1}/>
                        <stop offset="100%" stopColor={T.blue} stopOpacity={0.01}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                    <XAxis dataKey="w" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={40}/>
                    <Tooltip contentStyle={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:8}}/>
                    <Area type="monotone" dataKey="p90" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="url(#simBand)" dot={false}/>
                    <Area type="monotone" dataKey="p10" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="white" dot={false}/>
                    <Line type="monotone" dataKey="p50" stroke={T.blue} strokeWidth={2.5} dot={{r:3,fill:T.blue,stroke:'white',strokeWidth:1.5}}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* 시나리오 요약 */}
              <div style={{background:T.blueSoft,border:`1px solid ${T.blueMid}`,borderRadius:10,padding:'16px 20px'}}>
                <div style={{fontSize:12,fontWeight:700,color:T.blue,marginBottom:10}}>📋 시나리오 분석 요약</div>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {[
                    demandDelta!==0 && `• 수요 ${demandDelta>0?'증가':'감소'} ${Math.abs(demandDelta)}% 적용 → 주간 예상 수요 ${fmt(Math.round(selectedSku.weeklyDemand*(1+demandDelta/100)))} EA`,
                    productionDelta!==0 && `• 생산량 ${productionDelta>0?'증량':'감량'} ${Math.abs(productionDelta)}% → 주간 생산능력 ${fmt(Math.round(selectedSku.productionCap*(1+productionDelta/100)))} EA`,
                    safetyBuffer!==0 && `• 안전재고 버퍼 +${safetyBuffer}% → 목표 안전재고 ${fmt(safeStock)} EA`,
                    orderQty>0 && `• 추가 발주 ${fmt(orderQty)} EA — 리드타임 ${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일 후 입고 예정`,
                    leadTimeDelta!==0 && `• 리드타임 ${leadTimeDelta>0?'연장':'단축'} ${Math.abs(leadTimeDelta)}일 조정 → ${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일`,
                    tobeZeroWeeks===0 && zeroWeeks>0 && `✅ 시나리오 적용 시 ${zeroWeeks}주 결품 위험 완전 해소`,
                    tobeZeroWeeks>0 && `⚠ 시나리오 적용 후에도 ${tobeZeroWeeks}주 결품 위험 잔존 — 추가 조치 필요`,
                  ].filter(Boolean).map((txt,i)=>(
                    <div key={i} style={{fontSize:12,color:T.text2,lineHeight:1.6}}>{txt}</div>
                  ))}
                  {demandDelta===0&&productionDelta===0&&safetyBuffer===0&&orderQty===0&&leadTimeDelta===0&&(
                    <div style={{fontSize:12,color:T.text3}}>ⓘ 좌측 슬라이더를 조정하거나 AI 권고 시나리오를 선택하면 결과가 반영됩니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TAB 2: 시나리오 비교 ═══════════════ */}
      {activeTab === 'comparison' && (
        <div>
          {/* 저장된 시나리오 상태 */}
          <div style={{...card, marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1}}>📊 저장된 시나리오 ({savedScenarios.length}/3)</div>
              <div style={{display:'flex',gap:6}}>
                <input placeholder="시나리오 이름 입력" value={scenarioName} onChange={e=>setScenarioName(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')saveScenario()}}
                  style={{fontSize:12,padding:'6px 12px',border:`1px solid ${T.border}`,borderRadius:6,outline:'none',background:T.surface2,color:T.text1,width:180}}/>
                <Btn onClick={saveScenario} disabled={savedScenarios.length>=3||!scenarioName.trim()}>+ 현재 시나리오 저장</Btn>
              </div>
            </div>
            {savedScenarios.length === 0 ? (
              <div style={{textAlign:'center',padding:'40px 0',color:T.text3}}>
                <div style={{fontSize:32,marginBottom:12}}>📋</div>
                <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>저장된 시나리오가 없습니다</div>
                <div style={{fontSize:12}}>시뮬레이션 탭에서 시나리오를 구성한 후 저장해 주세요</div>
              </div>
            ) : (
              <div style={{display:'flex',gap:10}}>
                {savedScenarios.map(s => (
                  <div key={s.id} style={{flex:1,border:`2px solid ${s.color}`,borderRadius:10,padding:'14px 16px',background:`${s.color}08`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:10,height:10,borderRadius:'50%',background:s.color}}/>
                        <span style={{fontSize:13,fontWeight:700,color:T.text1}}>{s.name}</span>
                      </div>
                      <button onClick={()=>deleteScenario(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:T.text3,fontSize:16}}>×</button>
                    </div>
                    <div style={{fontSize:10,color:T.text2,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px'}}>
                      <span>수요: {s.params.demandDelta>0?'+':''}{s.params.demandDelta}%</span>
                      <span>생산: {s.params.productionDelta>0?'+':''}{s.params.productionDelta}%</span>
                      <span>안전재고: +{s.params.safetyBuffer}%</span>
                      <span>발주: {fmt(s.params.orderQty)} EA</span>
                      <span>리드타임: {s.params.leadTimeDelta>0?'+':''}{s.params.leadTimeDelta}일</span>
                      <span>SKU: {s.skuId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {savedScenarios.length > 0 && (
            <>
              {/* KPI 비교 테이블 */}
              <div style={{...card, marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:14}}>KPI 비교</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${T.border}`}}>
                      <th style={{textAlign:'left',padding:'8px 12px',color:T.text3,fontWeight:600,fontSize:11}}>지표</th>
                      {savedScenarios.map(s=>(
                        <th key={s.id} style={{textAlign:'right',padding:'8px 12px',fontWeight:700,fontSize:11}}>
                          <span style={{color:s.color}}>{s.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      {label:'최종 재고 (EA)', key:'finalStock', fmt:(v:number)=>fmt(v), good:'high'},
                      {label:'결품 예상 주차', key:'stockoutWeeks', fmt:(v:number)=>v===0?'없음':`${v}주`, good:'low'},
                      {label:'비용 변동 (₩)', key:'costDelta', fmt:(v:number)=>v===0?'변동없음':`₩${fmt(v)}`, good:'low'},
                      {label:'납기준수율', key:'deliveryRate', fmt:(v:number)=>`${v}%`, good:'high'},
                    ] as {label:string,key:keyof SavedScenario['kpis'],fmt:(v:number)=>string,good:string}[]).map(row=>(
                      <tr key={row.key} style={{borderBottom:`1px solid ${T.border}`}}>
                        <td style={{padding:'10px 12px',color:T.text2,fontWeight:600}}>{row.label}</td>
                        {savedScenarios.map(s=>{
                          const v = s.kpis[row.key]
                          const best = row.good==='high' ? Math.max(...savedScenarios.map(x=>x.kpis[row.key])) : Math.min(...savedScenarios.map(x=>x.kpis[row.key]))
                          const isBest = v === best && savedScenarios.length > 1
                          return (
                            <td key={s.id} style={{textAlign:'right',padding:'10px 12px',fontFamily:mono,fontWeight:isBest?800:500,color:isBest?T.green:T.text1}}>
                              {row.fmt(v)} {isBest && '★'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                {/* 오버레이 라인 차트 */}
                <div style={{...card}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>재고 추이 비교</div>
                  <div style={{fontSize:11,color:T.text3,marginBottom:14}}>각 시나리오의 TO-BE 재고 수준 오버레이</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart margin={{top:4,right:8,left:0,bottom:0}}
                      data={savedScenarios[0].simData.map((_,i) => {
                        const pt: Record<string,any> = { w: savedScenarios[0].simData[i].w }
                        savedScenarios.forEach((s,si) => { pt[`s${si}`] = s.simData[i]?.tobe ?? 0 })
                        return pt
                      })}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                      <XAxis dataKey="w" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={48} tickFormatter={(v:number)=>v>=1000?`${(v/1000).toFixed(1)}k`:String(v)}/>
                      <Tooltip contentStyle={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:8}} formatter={(v:number,name:string) => {
                        const idx = parseInt(name.replace('s',''))
                        return [fmt(v)+' EA', savedScenarios[idx]?.name ?? name]
                      }}/>
                      {savedScenarios.map((_,i) => (
                        <Line key={i} type="monotone" dataKey={`s${i}`} stroke={savedScenarios[i].color} strokeWidth={2.5}
                          dot={{r:3,fill:savedScenarios[i].color,stroke:'white',strokeWidth:1.5}}/>
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* 레이더 차트 */}
                <div style={{...card}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>다차원 비교 (레이더)</div>
                  <div style={{fontSize:11,color:T.text3,marginBottom:8}}>5개 축 기준 시나리오별 종합 평가</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={RADAR_AXES.map(ax => {
                      const pt: Record<string,any> = { axis: ax.label, fullMark: ax.fullMark }
                      savedScenarios.forEach((s,i) => { pt[`s${i}`] = s.radar[ax.key] ?? 0 })
                      return pt
                    })}>
                      <PolarGrid stroke={T.border}/>
                      <PolarAngleAxis dataKey="axis" tick={{fontSize:10,fill:T.text2}}/>
                      <PolarRadiusAxis angle={90} domain={[0,100]} tick={{fontSize:8,fill:T.text3}} axisLine={false}/>
                      {savedScenarios.map((_,i) => (
                        <Radar key={i} name={savedScenarios[i].name} dataKey={`s${i}`}
                          stroke={savedScenarios[i].color} fill={savedScenarios[i].color} fillOpacity={0.15} strokeWidth={2}/>
                      ))}
                      <Legend wrapperStyle={{fontSize:11}} formatter={(value:string) => {
                        const idx = parseInt(value.replace('s',''))
                        return savedScenarios[idx]?.name ?? value
                      }}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════ TAB 3: 민감도 분석 ═══════════════ */}
      {activeTab === 'sensitivity' && (
        <div>
          {/* KPI 선택 */}
          <div style={{display:'flex',gap:6,marginBottom:20}}>
            {SENSITIVITY_KPIS.map(kpi => (
              <button key={kpi.key} onClick={() => setTargetKpi(kpi.key)}
                style={{flex:1,padding:'10px 0',fontSize:12,fontWeight:targetKpi===kpi.key?700:500,borderRadius:8,
                  border:`1px solid ${targetKpi===kpi.key?T.blue:T.border}`,
                  background:targetKpi===kpi.key?T.blueSoft:'transparent',
                  color:targetKpi===kpi.key?T.blue:T.text2,cursor:'pointer',transition:'all 0.15s'}}>
                {kpi.label}
              </button>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            {/* 토네이도 차트 */}
            <div style={{...card}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>토네이도 차트 (Tornado)</div>
              <div style={{fontSize:11,color:T.text3,marginBottom:14}}>각 변수의 {SENSITIVITY_KPIS.find(k=>k.key===targetKpi)?.label} 영향도</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart layout="vertical" data={sensitivityData.map(d => ({
                  ...d, lowDelta: d.low - d.base, highDelta: d.high - d.base,
                }))} margin={{top:4,right:20,left:80,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}
                    tickFormatter={(v:number) => v>=1000||v<=-1000?`${(v/1000).toFixed(1)}k`:String(v)}/>
                  <YAxis type="category" dataKey="label" tick={{fontSize:11,fill:T.text2}} axisLine={false} tickLine={false} width={75}/>
                  <Tooltip contentStyle={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:8}}
                    formatter={(v:number, name:string) => [fmt(Math.round(v)), name==='lowDelta'?'하한 변동':'상한 변동']}/>
                  <ReferenceLine x={0} stroke={T.text3} strokeWidth={1}/>
                  <Bar dataKey="lowDelta" name="하한" stackId="a" radius={[4,0,0,4]}>
                    {sensitivityData.map((d,i) => <Cell key={i} fill={d.low < d.base ? T.red : T.blue} fillOpacity={0.7}/>)}
                  </Bar>
                  <Bar dataKey="highDelta" name="상한" stackId="b" radius={[0,4,4,0]}>
                    {sensitivityData.map((d,i) => <Cell key={i} fill={d.high > d.base ? T.blue : T.red} fillOpacity={0.7}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 워터폴 차트 */}
            <div style={{...card}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>영향도 워터폴 (Waterfall)</div>
              <div style={{fontSize:11,color:T.text3,marginBottom:14}}>변수별 누적 영향도 — 전체 변동 분해</div>
              {(() => {
                const totalImpact = sensitivityData.reduce((s,d) => s + (d.high - d.base), 0)
                let running = 0
                const waterfallData = sensitivityData.map(d => {
                  const delta = d.high - d.base
                  const prev = running
                  running += delta
                  return { label: d.label, base: Math.min(prev, running), value: Math.abs(delta), delta, running, color: d.color }
                })
                waterfallData.push({ label: '합계', base: 0, value: Math.abs(running), delta: running, running, color: T.text1 })
                return (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={waterfallData} margin={{top:4,right:8,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                      <XAxis dataKey="label" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={48}
                        tickFormatter={(v:number) => v>=1000||v<=-1000?`${(v/1000).toFixed(1)}k`:String(v)}/>
                      <Tooltip contentStyle={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:8}}
                        formatter={(v:number, name:string) => {
                          if (name === 'base') return ['', '']
                          return [fmt(Math.round(v)), '변동량']
                        }}/>
                      <Bar dataKey="base" stackId="a" fill="transparent" radius={0}/>
                      <Bar dataKey="value" stackId="a" radius={[3,3,0,0]}>
                        {waterfallData.map((d,i) => <Cell key={i} fill={d.delta >= 0 ? T.blue : T.red} fillOpacity={i===waterfallData.length-1?1:0.7}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </div>
          </div>

          {/* 영향도 테이블 */}
          <div style={{...card}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:14}}>변수별 영향도 상세</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${T.border}`}}>
                  {['변수','하한 테스트값','기준값','상한 테스트값','하한 결과','기준 결과','상한 결과','영향 범위','비중'].map(h=>(
                    <th key={h} style={{textAlign:h==='변수'?'left':'right',padding:'8px 10px',color:T.text3,fontWeight:600,fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityData.map((d,i) => {
                  const sv = SENSITIVITY_VARIABLES.find(v => v.key === d.variable)!
                  const totalImpact = sensitivityData.reduce((s,x) => s + x.impact, 0)
                  const pct = totalImpact > 0 ? (d.impact / totalImpact * 100).toFixed(1) : '0'
                  return (
                    <tr key={d.variable} style={{borderBottom:`1px solid ${T.border}`,background:i===0?T.blueSoft:'transparent'}}>
                      <td style={{padding:'10px',fontWeight:600,color:T.text1}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:8,height:8,borderRadius:2,background:d.color}}/>
                          {d.label}
                        </div>
                      </td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:T.text2}}>{sv.testRange[0]}{sv.unit}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:T.text1,fontWeight:600}}>{(params as any)[d.variable]}{sv.unit}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:T.text2}}>{sv.testRange[1]}{sv.unit}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:d.low<d.base?T.red:T.green}}>{fmt(Math.round(d.low))}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:T.text1,fontWeight:600}}>{fmt(Math.round(d.base))}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,color:d.high>d.base?T.green:T.red}}>{fmt(Math.round(d.high))}</td>
                      <td style={{textAlign:'right',padding:'10px',fontFamily:mono,fontWeight:700,color:i===0?T.blue:T.text1}}>{fmt(Math.round(d.impact))}</td>
                      <td style={{textAlign:'right',padding:'10px'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                          <div style={{width:60,height:6,background:T.surface2,borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${pct}%`,height:'100%',background:d.color,borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11,fontFamily:mono,color:T.text2,minWidth:36,textAlign:'right'}}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 분석 요약 */}
          <div style={{background:T.blueSoft,border:`1px solid ${T.blueMid}`,borderRadius:10,padding:'16px 20px',marginTop:16}}>
            <div style={{fontSize:12,fontWeight:700,color:T.blue,marginBottom:10}}>🎯 민감도 분석 요약</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {sensitivityData.length > 0 && (
                <>
                  <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>
                    • <b>{sensitivityData[0].label}</b>이(가) {SENSITIVITY_KPIS.find(k=>k.key===targetKpi)?.label}에 가장 큰 영향을 미칩니다 (영향 범위: {fmt(Math.round(sensitivityData[0].impact))})
                  </div>
                  {sensitivityData.length > 1 && (
                    <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>
                      • 2순위: <b>{sensitivityData[1].label}</b> (영향 범위: {fmt(Math.round(sensitivityData[1].impact))})
                    </div>
                  )}
                  <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>
                    • 의사결정 시 <b>{sensitivityData[0].label}</b> 변수를 최우선 관리하는 것을 권고합니다
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
