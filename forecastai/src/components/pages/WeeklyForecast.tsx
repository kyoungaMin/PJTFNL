'use client'
import React, { useState } from 'react'
import { AreaChart, Area, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { T, card, sectionTitle, WEEKLY_FORECAST_DATA, MAPE_TREND, RISK_ITEMS } from '@/lib/data'
import { Badge, GradeBadge, PageHeader, Btn, Table, FilterBar, Select } from '@/components/ui'

export default function PageWeeklyForecast() {
  const [showActual, setShowActual] = useState(true);
  const [weeks, setWeeks] = useState("12");
  const [sku, setSku] = useState("SKU-0421");
  const skus = ["SKU-0421","SKU-1183","SKU-0887","SKU-2201","SKU-0312"];
  const data = WEEKLY_FORECAST_DATA.slice(0, weeks==="8"?8:weeks==="4"?4:WEEKLY_FORECAST_DATA.length);
  const BandTooltip = ({active,payload,label}) => {
    if(!active||!payload?.length) return null;
    const p = Object.fromEntries(payload.map(p=>[p.dataKey,p.value]));
    return (
      <div style={{...card,padding:"10px 14px",boxShadow:"0 4px 14px rgba(15,23,42,0.1)"}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:6,fontWeight:600}}>{label}</div>
        {p.p90 && <div style={{fontSize:12,color:"#93C5FD"}}>P90 (상한): {p.p90?.toLocaleString()} EA</div>}
        {p.p50 && <div style={{fontSize:13,color:T.blue,fontWeight:700}}>P50 (중간): {p.p50?.toLocaleString()} EA</div>}
        {p.p10 && <div style={{fontSize:12,color:"#93C5FD"}}>P10 (하한): {p.p10?.toLocaleString()} EA</div>}
        {p.actual && <div style={{fontSize:12,color:T.orange,fontWeight:600}}>실적: {p.actual?.toLocaleString()} EA</div>}
      </div>
    );
  };
  return (
    <div>
      <PageHeader title="주간 수요예측" sub="SKU별 1~12주 예측 밴드 (P10 / P50 / P90)"
        action={<Btn variant="secondary">📥 CSV 내보내기</Btn>}/>
      <FilterBar>
        <Select value={sku} onChange={setSku} options={skus.map(s=>({value:s,label:s}))}/>
        <Select value="A타입 반도체 커넥터" onChange={()=>{}} options={["A타입 반도체 커넥터","B소켓","C마운트"]}/>
        <Select value="A사" onChange={()=>{}} options={["전체 고객사","A사","B사","C사"]}/>
        <div style={{ display:"flex", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, overflow:"hidden" }}>
          {["4","8","12"].map(w=>(
            <button key={w} onClick={()=>setWeeks(w)} style={{ fontSize:12, fontWeight:600, padding:"6px 14px", background:weeks===w?T.blue:"transparent", color:weeks===w?"white":T.text2, border:"none", cursor:"pointer" }}>{w}주</button>
          ))}
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:T.text2, cursor:"pointer" }}>
          <div onClick={()=>setShowActual(p=>!p)} style={{ width:36, height:20, borderRadius:10, background:showActual?T.blue:T.border, position:"relative", transition:"background 0.2s", cursor:"pointer" }}>
            <div style={{ position:"absolute", top:2, left:showActual?18:2, width:16, height:16, borderRadius:"50%", background:"white", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
          </div>
          실적 비교 표시
        </label>
      </FilterBar>

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:T.text1 }}>{sku} — A타입 반도체 커넥터</div>
            <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>단위: EA (개) · P10/P50/P90 예측 밴드</div>
          </div>
          <div style={{ background:T.amberSoft, border:`1px solid ${T.amberMid}`, borderRadius:7, padding:"7px 12px", fontSize:11, color:T.amber, fontWeight:500 }}>
            ⚠ 불확실성 지수: 높음 (고객 A사 발주 변동성 ±38%)
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{top:4,right:16,left:0,bottom:0}}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.blue} stopOpacity={0.12}/>
                <stop offset="100%" stopColor={T.blue} stopOpacity={0.03}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
            <XAxis dataKey="w" tick={{fontSize:11,fill:T.text3}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`}/>
            <Tooltip content={<BandTooltip/>}/>
            <Area type="monotone" dataKey="p90" stroke="#93C5FD" strokeWidth={1.2} strokeDasharray="4 3" fill="url(#bandFill)" dot={false}/>
            <Area type="monotone" dataKey="p10" stroke="#93C5FD" strokeWidth={1.2} strokeDasharray="4 3" fill="white" dot={false}/>
            <Line type="monotone" dataKey="p50" stroke={T.blue} strokeWidth={2.5} dot={false} activeDot={{r:5,fill:T.blue,stroke:"white",strokeWidth:2}}/>
            {showActual && <Line type="monotone" dataKey="actual" stroke={T.orange} strokeWidth={2} strokeDasharray="6 3" dot={{r:3,fill:T.orange}} connectNulls={false}/>}
          </ComposedChart>
        </ResponsiveContainer>

        <div style={{ display:"flex", gap:20, marginTop:12, padding:"10px 0", borderTop:`1px solid ${T.border}`, flexWrap:"wrap" }}>
          {[["─","P50 (중간값)",T.blue],["- -","P90 (상한 90%)",  "#93C5FD"],["- -","P10 (하한 10%)","#93C5FD"],["- -","실적 (표시중)",T.orange]].map(([dash,lbl,col])=>(
            <div key={lbl} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.text2 }}>
              <div style={{ width:20, borderTop:`2.5px ${dash==="─"?"solid":"dashed"} ${col}` }}/>
              {lbl}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, marginTop:16 }}>
        <div style={{ ...sectionTitle }}>주차별 예측 수치</div>
        <Table
          headers={["주차","P10 (EA)","P50 (EA)","P90 (EA)","실적 (EA)","구분"]}
          rows={data.map(d=>({ cells:[
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:600}}>{d.w}</span>,
            <span style={{color:T.text3}}>{d.p10?.toLocaleString() ?? "─"}</span>,
            <span style={{fontWeight:700,color:T.blue}}>{d.p50?.toLocaleString()}</span>,
            <span style={{color:T.text3}}>{d.p90?.toLocaleString() ?? "─"}</span>,
            <span style={{color:T.orange}}>{d.actual?.toLocaleString() ?? "─"}</span>,
            d.actual ? <Badge color={T.green} bg={T.greenSoft} border={T.greenMid}>실적</Badge> : <Badge color={T.blue} bg={T.blueSoft} border={T.blueMid}>예측</Badge>,
          ]}))}
        />
      </div>
      <div style={{ marginTop:12, fontSize:11, color:T.text3 }}>ⓘ 모델: LSTM + XGBoost 앙상블 | 마지막 학습: 2025-01-13 03:00</div>
    </div>
  );
}