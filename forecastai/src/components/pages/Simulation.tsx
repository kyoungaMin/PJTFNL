'use client'
import React, { useState } from 'react'
import { AreaChart, Area, ComposedChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { T, card, sectionTitle, SIM_SKUS, SIM_CUSTOMERS, SIM_PERIODS, AI_PRESETS } from '@/lib/data'
import { Badge, PageHeader, Btn, Select } from '@/components/ui'

function SimSlider({ label, value, onChange, min, max, step=1, unit="", color=T.blue }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:600, color:T.text2 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:800, color, fontFamily:"'IBM Plex Mono',monospace" }}>
          {value > 0 && "+"}{value}{unit}
        </span>
      </div>
      <div style={{ position:"relative", height:6, background:T.surface2, borderRadius:3, cursor:"pointer" }}>
        <div style={{ position:"absolute", left:0, width:`${pct}%`, height:"100%", background:color, borderRadius:3 }}/>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:0, width:"100%", height:20, opacity:0, cursor:"pointer", margin:0 }}/>
        <div style={{ position:"absolute", top:"50%", left:`${pct}%`, transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", background:color, border:"2px solid white", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", pointerEvents:"none" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
        <span style={{ fontSize:9, color:T.text3 }}>{min}{unit}</span>
        <span style={{ fontSize:9, color:T.text3 }}>{max}{unit}</span>
      </div>
    </div>
  );
}

function SimResultCard({ label, value, sub, color=T.blue, icon }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 18px", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>{icon} {label}</div>
      <div style={{ fontSize:20, fontWeight:800, color, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:T.text2, marginTop:5 }}>{sub}</div>
    </div>
  );
}

export default function PageSimulation() {
  const [selectedSku,  setSelectedSku]  = useState(SIM_SKUS[0]);
  const [customer,     setCustomer]     = useState("전체 고객사");
  const [period,       setPeriod]       = useState(8);
  const [activePreset, setActivePreset] = useState(null);
  const [appliedPreset,setAppliedPreset]= useState(false);

  // Editable parameters
  const [demandDelta,    setDemandDelta]    = useState(0);
  const [productionDelta,setProductionDelta]= useState(0);
  const [safetyBuffer,   setSafetyBuffer]   = useState(0);
  const [orderQty,       setOrderQty]       = useState(0);
  const [leadTimeDelta,  setLeadTimeDelta]  = useState(0);

  const params = { demandDelta, productionDelta, safetyBuffer, orderQty, leadTimeDelta };
  const simData = runSimulation(selectedSku, params, period);
  const zeroWeeks = simData.filter(d => d.asis <= 0).length;
  const tobeZeroWeeks = simData.filter(d => d.tobe <= 0).length;
  const lastTobe = simData[simData.length-1]?.tobe ?? 0;
  const lastAsis = simData[simData.length-1]?.asis ?? 0;
  const safeStock = Math.round(selectedSku.safeStock * (1 + safetyBuffer/100));
  const stockoutElim = zeroWeeks > 0 && tobeZeroWeeks === 0;
  const costSaving   = Math.round(Math.abs(productionDelta) * selectedSku.productionCap * 800);

  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    const p = preset.params;
    setDemandDelta(p.demandDelta);
    setProductionDelta(p.productionDelta);
    setSafetyBuffer(p.safetyBuffer);
    setOrderQty(p.orderQty);
    setLeadTimeDelta(p.leadTimeDelta);
    setAppliedPreset(true);
    setTimeout(() => setAppliedPreset(false), 2000);
  };
  const resetParams = () => {
    setDemandDelta(0); setProductionDelta(0); setSafetyBuffer(0);
    setOrderQty(0); setLeadTimeDelta(0); setActivePreset(null);
  };

  // Chart custom bar — red if below safe
  const SimBarTooltip = ({active, payload, label}) => {
    if(!active||!payload?.length) return null;
    const asis = payload.find(p=>p.dataKey==="asis")?.value;
    const tobe = payload.find(p=>p.dataKey==="tobe")?.value;
    return (
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",boxShadow:"0 4px 12px rgba(15,23,42,0.1)"}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:5,fontWeight:600}}>{label}</div>
        <div style={{fontSize:12,color:"#94A3B8",fontWeight:600}}>현재 계획: {asis?.toLocaleString()} EA</div>
        <div style={{fontSize:12,color:tobe<safeStock?T.red:T.blue,fontWeight:700}}>시나리오: {tobe?.toLocaleString()} EA {tobe<safeStock?"⚠ 안전재고 미달":""}</div>
        <div style={{fontSize:11,color:T.text3,marginTop:3}}>안전재고선: {safeStock.toLocaleString()} EA</div>
      </div>
    );
  };

  const presetColors = { red: {c:T.red, bg:T.redSoft, b:T.redMid}, blue:{c:T.blue,bg:T.blueSoft,b:T.blueMid}, amber:{c:T.amber,bg:T.amberSoft,b:T.amberMid} };

  return (
    <div>
      <PageHeader title="시나리오 시뮬레이션"
        sub="변수 조정 → AS-IS / TO-BE 재고 비교 · AI 권고 시나리오 즉시 적용"
        action={
          <div style={{display:"flex",gap:8}}>
            <Btn variant="secondary" onClick={resetParams}>↺ 초기화</Btn>
            <Btn>💾 시나리오 저장</Btn>
          </div>
        }/>

      {/* ── AI 권고 프리셋 ── */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>🤖 AI 권고 시나리오</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {AI_PRESETS.map(preset => {
            const pc = presetColors[preset.badgeColor];
            const isActive = activePreset===preset.id;
            return (
              <div key={preset.id}
                onClick={() => applyPreset(preset)}
                style={{background:isActive?pc.bg:T.surface, border:`1px solid ${isActive?pc.c:T.border}`, borderRadius:10, padding:"14px 16px", cursor:"pointer", transition:"all 0.15s", boxShadow:isActive?`0 0 0 2px ${pc.c}30`:"none"}}
                onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=T.surface2; }}
                onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background=T.surface; }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:12,fontWeight:700,color:isActive?pc.c:T.text1}}>{preset.label}</span>
                  <span style={{fontSize:10,fontWeight:700,color:pc.c,background:pc.bg,border:`1px solid ${pc.b}`,borderRadius:4,padding:"2px 7px"}}>{preset.badge}</span>
                </div>
                <div style={{fontSize:11,color:T.text2,lineHeight:1.6}}>{preset.desc}</div>
                {isActive && (
                  <div style={{marginTop:8,fontSize:11,color:pc.c,fontWeight:600}}>✓ 적용됨 — 아래 슬라이더에 반영되었습니다</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16,alignItems:"start"}}>

        {/* ── LEFT: 파라미터 패널 ── */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:16}}>⚙ 시나리오 변수</div>

          {/* SKU 선택 */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>분석 SKU</div>
            <select value={selectedSku.id} onChange={e=>setSelectedSku(SIM_SKUS.find(s=>s.id===e.target.value))}
              style={{width:"100%",fontSize:12,color:T.text1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",outline:"none"}}>
              {SIM_SKUS.map(s=><option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
            </select>
          </div>

          {/* 고객사 */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>고객사</div>
            <select value={customer} onChange={e=>setCustomer(e.target.value)}
              style={{width:"100%",fontSize:12,color:T.text1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",outline:"none"}}>
              {SIM_CUSTOMERS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>

          {/* 시뮬레이션 기간 */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:6}}>시뮬레이션 기간</div>
            <div style={{display:"flex",gap:6}}>
              {SIM_PERIODS.map(w=>(
                <button key={w} onClick={()=>setPeriod(w)}
                  style={{flex:1,padding:"6px 0",fontSize:12,fontWeight:600,borderRadius:6,border:`1px solid ${period===w?T.blue:T.border}`,background:period===w?T.blueSoft:"transparent",color:period===w?T.blue:T.text2,cursor:"pointer"}}>
                  {w}주
                </button>
              ))}
            </div>
          </div>

          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16,marginBottom:4}}>
            <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:14}}>수요 / 생산 변수</div>
          </div>

          <SimSlider label="수요 변동률" value={demandDelta} onChange={setDemandDelta} min={-30} max={50} unit="%" color={T.blue}/>
          <SimSlider label="생산량 조정" value={productionDelta} onChange={setProductionDelta} min={-30} max={50} unit="%" color={T.green}/>

          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16,marginBottom:4}}>
            <div style={{fontSize:11,fontWeight:700,color:T.text3,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:14}}>재고 / 발주 변수</div>
          </div>

          <SimSlider label="안전재고 버퍼" value={safetyBuffer} onChange={setSafetyBuffer} min={0} max={50} unit="%" color={T.purple}/>
          <SimSlider label="추가 발주량" value={orderQty} onChange={setOrderQty} min={0} max={5000} step={100} unit=" EA" color={T.orange}/>
          <SimSlider label="리드타임 조정" value={leadTimeDelta} onChange={setLeadTimeDelta} min={-7} max={14} unit="일" color={T.amber}/>

          {/* 현재 SKU 기준값 */}
          <div style={{marginTop:16,padding:"10px 12px",background:T.surface2,borderRadius:8,fontSize:11,color:T.text2}}>
            <div style={{fontWeight:700,color:T.text1,marginBottom:6}}>현재 기준값</div>
            {[["현재 재고",`${selectedSku.currentStock.toLocaleString()} EA`],
              ["안전재고",`${safeStock.toLocaleString()} EA`],
              ["주 생산능력",`${selectedSku.productionCap.toLocaleString()} EA`],
              ["주간 수요",`${selectedSku.weeklyDemand.toLocaleString()} EA`],
              ["리드타임",`${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일`],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:T.text3}}>{k}</span>
                <span style={{fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: 결과 영역 ── */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* 결과 KPI 카드 4개 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            <SimResultCard icon="📦" label="시나리오 후 재고" value={`${lastTobe.toLocaleString()}`} sub={`현재 계획 대비 ${lastTobe>=lastAsis?"":"+"} ${((lastTobe-lastAsis)/Math.max(lastAsis,1)*100).toFixed(1)}%`} color={lastTobe>=safeStock?T.green:T.red}/>
            <SimResultCard icon="⚠" label="결품 예상 주차" value={tobeZeroWeeks===0?"없음":`${tobeZeroWeeks}주`} sub={zeroWeeks>0?`현재계획 ${zeroWeeks}주 결품`:"현재계획도 안전"} color={tobeZeroWeeks===0?T.green:T.red}/>
            <SimResultCard icon="💰" label="예상 비용 변화" value={productionDelta===0?"변동없음":productionDelta>0?`+₩${(costSaving/1000).toFixed(0)}K`:`-₩${(costSaving/1000).toFixed(0)}K`} sub={productionDelta>0?"생산비 증가":"보관비 절감 예상"} color={productionDelta>=0?T.amber:T.green}/>
            <SimResultCard icon="✅" label="납기준수율 예측" value={tobeZeroWeeks===0?"95%+":tobeZeroWeeks<=1?"82%":"63%"} sub="시나리오 기준 추정치" color={tobeZeroWeeks===0?T.green:T.amber}/>
          </div>

          {/* 메인 차트: AS-IS vs TO-BE 재고 바 */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
            <div style={{marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1}}>재고 수준 비교 (AS-IS vs TO-BE)</div>
              <div style={{fontSize:11,color:T.text3,marginTop:2}}>현재 계획(AS-IS) 대비 시나리오 적용 후(TO-BE)의 재고 수준 변화</div>
            </div>
            {/* Legend */}
            <div style={{display:"flex",gap:20,marginTop:10,marginBottom:14,fontSize:11,color:T.text2}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:12,height:12,borderRadius:2,background:"#CBD5E1"}}/> 현재 계획</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:12,height:12,borderRadius:2,background:T.blue}}/> 시나리오 적용</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke={T.red} strokeWidth={1.5} strokeDasharray="4 2"/></svg> 안전 재고선</div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={simData} margin={{top:4,right:8,left:0,bottom:0}} barGap={4} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                <XAxis dataKey="w" tick={{fontSize:11,fill:T.text3}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={40} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(1)}k`:v}/>
                <Tooltip content={<SimBarTooltip/>}/>
                <Bar dataKey="asis" name="현재 계획" fill="#CBD5E1" radius={[3,3,0,0]}>
                  {simData.map((entry,index)=>(
                    <Cell key={`asis-${index}`} fill="#CBD5E1"/>
                  ))}
                </Bar>
                <Bar dataKey="tobe" name="시나리오 적용" radius={[3,3,0,0]}>
                  {simData.map((entry,index)=>(
                    <Cell key={`tobe-${index}`} fill={entry.tobe < entry.safe ? "#FCA5A5" : T.blue}/>
                  ))}
                </Bar>
                <ReferenceLine y={safeStock} stroke={T.red} strokeDasharray="5 3" strokeWidth={1.5}
                  label={{value:`안전재고 ${safeStock.toLocaleString()}EA`, position:"insideTopRight", fontSize:9, fill:T.red, dy:-2}}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* P10/P50/P90 수요 예측 밴드 시나리오 */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:4}}>수요 시나리오 예측 밴드 (P10 / P50 / P90)</div>
            <div style={{fontSize:11,color:T.text3,marginBottom:14}}>조정된 수요 변동률 기준 확률적 수요 범위</div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={simData.map(d=>{
                const base = selectedSku.weeklyDemand*(1+demandDelta/100);
                return {...d, p50:Math.round(base), p10:Math.round(base*0.75), p90:Math.round(base*1.32)};
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
                <Line type="monotone" dataKey="p50" stroke={T.blue} strokeWidth={2.5} dot={{r:3,fill:T.blue,stroke:"white",strokeWidth:1.5}}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 시나리오 요약 텍스트 */}
          <div style={{background:T.blueSoft,border:`1px solid ${T.blueMid}`,borderRadius:10,padding:"16px 20px"}}>
            <div style={{fontSize:12,fontWeight:700,color:T.blue,marginBottom:10}}>📋 시나리오 분석 요약</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                demandDelta!==0 && `• 수요 ${demandDelta>0?"증가":"감소"} ${Math.abs(demandDelta)}% 적용 → 주간 예상 수요 ${Math.round(selectedSku.weeklyDemand*(1+demandDelta/100)).toLocaleString()} EA`,
                productionDelta!==0 && `• 생산량 ${productionDelta>0?"증량":"감량"} ${Math.abs(productionDelta)}% → 주간 생산능력 ${Math.round(selectedSku.productionCap*(1+productionDelta/100)).toLocaleString()} EA`,
                safetyBuffer!==0 && `• 안전재고 버퍼 +${safetyBuffer}% → 목표 안전재고 ${safeStock.toLocaleString()} EA`,
                orderQty>0 && `• 추가 발주 ${orderQty.toLocaleString()} EA — 리드타임 ${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일 후 입고 예정`,
                leadTimeDelta!==0 && `• 리드타임 ${leadTimeDelta>0?"연장":""} ${Math.abs(leadTimeDelta)}일 조정 → ${Math.max(1,selectedSku.leadTime+leadTimeDelta)}일`,
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
  );
}