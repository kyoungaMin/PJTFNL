'use client'
import React, { useState } from 'react'
import { AreaChart, Area, ComposedChart, Bar, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { T, card, sectionTitle, MONTHLY_FORECAST_DATA } from '@/lib/data'
import { Badge, PageHeader, Btn, FilterBar, Select, Table } from '@/components/ui'

export default function PageMonthlyForecast() {
  const [showFX, setShowFX]   = useState(true);
  const [showSOX, setShowSOX] = useState(true);
  const TT = ({active,payload,label}) => {
    if(!active||!payload?.length) return null;
    return (
      <div style={{...card,padding:"10px 14px",boxShadow:"0 4px 14px rgba(15,23,42,0.1)"}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:6,fontWeight:600}}>{label}</div>
        {payload.map(p=>(
          <div key={p.dataKey} style={{fontSize:12,color:p.color,fontWeight:600,marginTop:2}}>
            {p.name}: {p.value?.toLocaleString()} {p.dataKey==="p50"?"EA":p.dataKey==="fx"?"KRW/USD":"pt"}
          </div>
        ))}
      </div>
    );
  };
  return (
    <div>
      <PageHeader title="월간 수요예측" sub="1~6개월 중장기 트렌드 · 외부 지표 영향 분석"/>
      <FilterBar>
        <Select value="전체 제품군" onChange={()=>{}} options={["전체 제품군","A타입 커넥터류","B소켓류"]}/>
        <Select value="전체 고객사" onChange={()=>{}} options={["전체 고객사","A사","B사","C사"]}/>
        <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:T.text2 }}>
          <input type="checkbox" checked={showFX} onChange={e=>setShowFX(e.target.checked)} style={{accentColor:T.blue}}/> KRW/USD 환율
        </label>
        <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:T.text2 }}>
          <input type="checkbox" checked={showSOX} onChange={e=>setShowSOX(e.target.checked)} style={{accentColor:T.purple}}/> SOX 지수
        </label>
      </FilterBar>

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div style={sectionTitle}>월별 수요 추세 + 외부 지표</div>
          <div style={{ fontSize:11, color:T.text3 }}>좌측: 수량(EA) · 우측: 외부 지표</div>
        </div>
        <div style={{ padding:"10px 14px", background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:7, fontSize:12, color:T.blue, marginBottom:16, fontWeight:500 }}>
          🤖 AI 인사이트: 4월 환율 상승(+1.6%) → 고객 A사 발주 -8% 예상. SOX 지수 하락 구간 주의.
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={MONTHLY_FORECAST_DATA} margin={{top:4,right:50,left:0,bottom:0}}>
            <defs>
              <linearGradient id="monthBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.blue} stopOpacity={0.1}/>
                <stop offset="100%" stopColor={T.blue} stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
            <XAxis dataKey="m" tick={{fontSize:11,fill:T.text3}} axisLine={false} tickLine={false}/>
            <YAxis yAxisId="left" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
            <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}/>
            <Tooltip content={<TT/>}/>
            <Area yAxisId="left" type="monotone" dataKey="p90" name="P90" stroke="#BFDBFE" strokeWidth={1} fill="url(#monthBand)" dot={false}/>
            <Area yAxisId="left" type="monotone" dataKey="p10" name="P10" stroke="#BFDBFE" strokeWidth={1} fill="white" dot={false}/>
            <Line yAxisId="left" type="monotone" dataKey="p50" name="수요 P50" stroke={T.blue} strokeWidth={2.5} dot={{r:4,fill:T.blue,stroke:"white",strokeWidth:2}} activeDot={{r:5}}/>
            {showFX  && <Line yAxisId="right" type="monotone" dataKey="fx"  name="KRW/USD" stroke={T.amber}  strokeWidth={1.8} strokeDasharray="5 3" dot={false}/>}
            {showSOX && <Line yAxisId="right" type="monotone" dataKey="sox" name="SOX Index" stroke={T.purple} strokeWidth={1.8} strokeDasharray="5 3" dot={false}/>}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display:"flex", gap:20, marginTop:12, paddingTop:12, borderTop:`1px solid ${T.border}`, flexWrap:"wrap" }}>
          {[["P50 수요",T.blue,"solid"],["예측 밴드","#93C5FD","dashed"],["KRW/USD",T.amber,"dashed"],["SOX Index",T.purple,"dashed"]].map(([lbl,col,dash])=>(
            <div key={lbl} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.text2 }}>
              <div style={{ width:18, borderTop:`2px ${dash} ${col}` }}/>{lbl}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:16 }}>
        <div style={card}>
          <div style={sectionTitle}>월별 예측 요약</div>
          <Table
            headers={["월","P50 (EA)","전월 대비"]}
            rows={MONTHLY_FORECAST_DATA.map((d,i)=>({ cells:[
              <span style={{fontWeight:600,color:T.text1}}>{d.m}</span>,
              <span style={{fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:T.blue}}>{d.p50.toLocaleString()}</span>,
              i===0 ? <span style={{color:T.text3}}>─</span> :
                (() => {
                  const diff = d.p50 - MONTHLY_FORECAST_DATA[i-1].p50;
                  const pct = ((diff/MONTHLY_FORECAST_DATA[i-1].p50)*100).toFixed(1);
                  return <span style={{color:diff>0?T.green:T.red,fontWeight:600}}>{diff>0?"↑":"↓"} {Math.abs(pct)}%</span>;
                })()
            ]}))}
          />
        </div>
        <div style={card}>
          <div style={sectionTitle}>외부 지표 영향도 분석 <span style={{fontSize:11,color:T.text3,fontWeight:400}}>(AI 분석)</span></div>
          <Table
            headers={["지표","상관계수","영향 방향"]}
            rows={[
              {cells:["KRW/USD 환율", <span style={{fontFamily:"'IBM Plex Mono',monospace",color:T.red,fontWeight:700}}>-0.72</span>, <span style={{color:T.red}}>역상관 ↓</span>]},
              {cells:["SOX 반도체지수", <span style={{fontFamily:"'IBM Plex Mono',monospace",color:T.green,fontWeight:700}}>+0.68</span>, <span style={{color:T.green}}>정상관 ↑</span>]},
              {cells:["국내 GDP 성장률", <span style={{fontFamily:"'IBM Plex Mono',monospace",color:T.green,fontWeight:700}}>+0.44</span>, <span style={{color:T.green}}>정상관 ↑</span>]},
              {cells:["DRAM 현물가", <span style={{fontFamily:"'IBM Plex Mono',monospace",color:T.green,fontWeight:700}}>+0.58</span>, <span style={{color:T.green}}>정상관 ↑</span>]},
            ]}
          />
          <div style={{ marginTop:12, fontSize:11, color:T.text3 }}>ⓘ 상관계수: -1~+1. |값|이 클수록 영향도 높음.</div>
        </div>
      </div>
    </div>
  );
}