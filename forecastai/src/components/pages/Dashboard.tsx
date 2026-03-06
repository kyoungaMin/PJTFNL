'use client'
import React, { useState, useEffect } from 'react'
import { AreaChart, Area, LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid, ReferenceLine } from 'recharts'
import { T, card, sectionTitle, KPI_DATA, REVENUE_FORECAST, RISK_DONUT, ACTION_ITEMS_FULL } from '@/lib/data'
import { Badge, RiskTypeBadge, PageHeader, Btn } from '@/components/ui'

function KpiCard({ kpi, delay=0 }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t=setTimeout(()=>setVis(true),delay); return ()=>clearTimeout(t); }, [delay]);
  const sm = {
    achieved:{ label:"달성", bg:T.greenSoft, color:T.green, bar:T.green },
    watch:   { label:"관찰", bg:T.amberSoft, color:T.amber, bar:T.amber },
    risk:    { label:"위험", bg:T.redSoft,   color:T.red,   bar:T.red   },
  }[kpi.status];
  return (
    <div style={{ ...card, padding:"20px 22px", display:"flex", flexDirection:"column", gap:12,
      opacity:vis?1:0, transform:vis?"translateY(0)":"translateY(10px)",
      transition:`opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
      overflow:"hidden", position:"relative" }}>
      {/* 상단 컬러 바 */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:sm.bar, borderRadius:"10px 10px 0 0" }}/>
      {/* 라벨 */}
      <div style={{ fontSize:12, fontWeight:600, color:T.text3, letterSpacing:"0.03em", paddingTop:2 }}>{kpi.label}</div>
      {/* 값 */}
      <div style={{ fontSize:28, fontWeight:800, color:T.text1, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>{kpi.value}</div>
      {/* 목표 + 배지 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, color:T.text3 }}>목표 {kpi.target}</span>
        <Badge color={sm.color} bg={sm.bg} border={sm.bg}>
          <span style={{ width:5, height:5, borderRadius:"50%", background:sm.color, display:"inline-block" }}/>
          {sm.label}
        </Badge>
      </div>
      {/* 상세 */}
      <div style={{ fontSize:11, color:T.text2, marginTop:-4 }}>{kpi.detail}</div>
    </div>
  );
}

function RevenueForecastChart() {
  const RevTT = ({active,payload,label}) => {
    if(!active||!payload?.length) return null;
    const vals = Object.fromEntries(payload.map(p=>[p.dataKey, p.value]));
    return (
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",boxShadow:"0 4px 16px rgba(15,23,42,0.12)",minWidth:160}}>
        <div style={{fontSize:11,color:T.text3,marginBottom:6,fontWeight:600}}>{label}</div>
        {vals.p90!=null&&<div style={{fontSize:11,color:"#60A5FA",marginBottom:2}}>P90 (낙관): ₩{vals.p90?.toLocaleString()}M</div>}
        {vals.p50!=null&&<div style={{fontSize:13,color:T.blue,fontWeight:700,marginBottom:2}}>P50 (기준): ₩{vals.p50?.toLocaleString()}M</div>}
        {vals.p10!=null&&<div style={{fontSize:11,color:"#60A5FA",marginBottom:2}}>P10 (보수): ₩{vals.p10?.toLocaleString()}M</div>}
        {vals.actual!=null&&<div style={{fontSize:12,color:T.orange,fontWeight:600,marginTop:4,paddingTop:4,borderTop:`1px solid ${T.border}`}}>실적: ₩{vals.actual?.toLocaleString()}M</div>}
      </div>
    );
  };
  const lastActualRow = [...REVENUE_FORECAST].filter(d=>d.actual).pop();
  const nextFcstRow   = REVENUE_FORECAST.find(d=>!d.actual);
  const mom = nextFcstRow&&lastActualRow ? (((nextFcstRow.p50-lastActualRow.actual)/lastActualRow.actual)*100).toFixed(1) : null;
  const isUp = parseFloat(mom)>=0;
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:3}}>매출 예측 추이</div>
          <div style={{fontSize:11,color:T.text3}}>단위: 백만원 &nbsp;·&nbsp; 실선=실적 &nbsp; 점선=예측 밴드 (P10~P90)</div>
        </div>
        {nextFcstRow&&<div style={{padding:"8px 14px",background:isUp?T.greenSoft:T.redSoft,border:`1px solid ${isUp?T.greenMid:T.redMid}`,borderRadius:9,textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:9,color:T.text3,marginBottom:3}}>다음달 P50 예측</div>
          <div style={{fontSize:17,fontWeight:800,color:isUp?T.green:T.red,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}}>₩{nextFcstRow.p50.toLocaleString()}M</div>
          <div style={{fontSize:10,color:isUp?T.green:T.red,fontWeight:600,marginTop:3}}>{isUp?"▲":"▼"} {Math.abs(mom)}% MoM</div>
        </div>}
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={REVENUE_FORECAST} margin={{top:4,right:8,left:0,bottom:0}}>
          <defs>
            <linearGradient id="revBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.blue} stopOpacity={0.09}/>
              <stop offset="100%" stopColor={T.blue} stopOpacity={0.01}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="m" tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`} width={32}/>
          <Tooltip content={<RevTT/>}/>
          <Area type="monotone" dataKey="p90" name="p90" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="url(#revBand)" dot={false}/>
          <Area type="monotone" dataKey="p10" name="p10" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="white" dot={false}/>
          <Line type="monotone" dataKey="p50" name="p50" stroke={T.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{r:4,fill:T.blue,stroke:"white",strokeWidth:2}}/>
          <Line type="monotone" dataKey="actual" name="actual" stroke={T.orange} strokeWidth={2.5}
            dot={{r:3,fill:T.orange,stroke:"white",strokeWidth:1.5}}
            activeDot={{r:5,fill:T.orange,stroke:"white",strokeWidth:2}} connectNulls={false}/>
          <ReferenceLine x="'24.12" stroke={T.borderMid} strokeDasharray="3 3"
            label={{value:"실적↔예측",position:"insideTopRight",fontSize:9,fill:T.text3,dy:-2}}/>
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{display:"flex",gap:18,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,flexWrap:"wrap"}}>
        {[["실적",T.orange,"solid",2.5],["P50 예측",T.blue,"dashed",2],["P10~P90 밴드","#93C5FD","dashed",1]].map(([lbl,col,dash,w])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.text2}}>
            <svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke={col} strokeWidth={w} strokeDasharray={dash==="dashed"?"5 3":"0"}/></svg>
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function AIInsightPanel() {
  const insights = [
    {dot:T.blue,  text:<>DRAM 수요가 다음 달 <strong style={{color:T.blue}}>+15% 증가</strong>할 것으로 예상됩니다.</>},
    {dot:T.red,   text:<>DDR4 제품의 <strong style={{color:T.red}}>재고 부족 위험</strong>이 꾸준히 증가하고 있습니다. 선제적 조치가 필요합니다.</>},
    {dot:T.amber, text:<>환율 상승 추세로 인해 일부 해외 원자재 <strong style={{color:T.amber}}>원가 상승 가능성</strong>이 감지되었습니다.</>},
    {dot:T.green, text:<>생산 액션큐 HIGH 2건 승인 시 납기준수율 <strong style={{color:T.green}}>+12%p</strong> 개선이 예상됩니다.</>},
    {dot:T.purple,text:<>SOX 지수 5,180pt 보합 — 반도체 업황 단기 안정. 예측 신뢰도 <strong style={{color:T.purple}}>91%</strong>.</>},
  ];
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span style={{fontSize:15,fontWeight:700,color:T.text1}}>AI 인사이트 요약</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:9,flex:1}}>
        {insights.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:T.surface2,borderRadius:9,border:`1px solid ${T.border}`}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:item.dot,flexShrink:0,marginTop:4}}/>
            <div style={{fontSize:13,color:T.text2,lineHeight:1.6}}>{item.text}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:12,fontSize:10,color:T.text3}}>ⓘ AI 분석 기준: 오늘 09:15 · LSTM 예측 모델 + 외부 지표</div>
    </div>
  );
}

export default function PageDashboard() {
  const [activeGrade, setActiveGrade] = useState(null);
  const efCount = RISK_DONUT.filter(d=>["E","F"].includes(d.grade)).reduce((a,b)=>a+b.count,0);
  const total   = RISK_DONUT.reduce((a,b)=>a+b.count,0);
  return (
    <div>
      <PageHeader title="대시보드" sub="이번 주: 2025년 W03 · 생산계획팀 주간 현황"
        action={<Btn>📄 주간 보고 내보내기</Btn>}/>

      {/* ── KPI 4개 ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {KPI_DATA.map((k,i)=><KpiCard key={k.id} kpi={k} delay={i*60}/>)}
      </div>

      {/* ── Row 2: 매출 예측 (넓게) + 위험 도넛 ── */}
      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16,marginBottom:16}}>
        <RevenueForecastChart/>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={sectionTitle}>위험 품목 현황</div>
            <Badge color={T.text3} bg={T.surface2} border={T.border}>전체 {total}건</Badge>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{position:"relative",width:128,height:128,flexShrink:0}}>
              <PieChart width={128} height={128}>
                <Pie data={RISK_DONUT} dataKey="count" cx={59} cy={59}
                  innerRadius={35} outerRadius={56} paddingAngle={2}
                  startAngle={90} endAngle={-270}
                  onMouseEnter={(_,i)=>setActiveGrade(RISK_DONUT[i].grade)}
                  onMouseLeave={()=>setActiveGrade(null)}>
                  {RISK_DONUT.map(e=><Cell key={e.grade} fill={e.color} opacity={activeGrade&&activeGrade!==e.grade?0.2:1} stroke="white" strokeWidth={2}/>)}
                </Pie>
              </PieChart>
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
                <div style={{fontSize:19,fontWeight:800,color:T.red,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}}>{efCount}</div>
                <div style={{fontSize:8,color:T.text3,lineHeight:1.4,marginTop:2}}>E~F<br/>위험</div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,flex:1}}>
              {RISK_DONUT.map(d=>(
                <div key={d.grade} style={{display:"flex",alignItems:"center",justifyContent:"space-between",opacity:activeGrade&&activeGrade!==d.grade?0.2:1,transition:"opacity 0.15s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:7,height:7,borderRadius:2,background:d.color,flexShrink:0}}/>
                    <span style={{fontSize:11,color:T.text2,fontWeight:500}}>Grade {d.grade}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:44,height:4,background:T.surface2,borderRadius:2}}>
                      <div style={{width:`${(d.count/total)*100}%`,height:"100%",background:d.color,borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:T.text1,fontFamily:"'IBM Plex Mono',monospace",minWidth:22,textAlign:"right"}}>{d.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginTop:12,padding:"8px 11px",background:T.redSoft,border:`1px solid ${T.redMid}`,borderRadius:7,fontSize:11,color:T.red,fontWeight:500}}>
            ⚠ E~F 등급 {efCount}건 — 이번 주 내 조치 필요
          </div>
        </div>
      </div>

      {/* ── Row 3: 액션큐 미리보기 + AI 인사이트 ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,paddingBottom:24}}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px 24px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{...sectionTitle,marginBottom:0,display:"flex",alignItems:"center",gap:8}}>
              AI 생산 권고사항 <Badge color={T.red} bg={T.redSoft} border={T.redMid}>3</Badge>
            </div>
            <Btn variant="ghost">전체 보기 →</Btn>
          </div>
          {ACTION_ITEMS_FULL.slice(0,3).map(item=>(
            <div key={item.id} style={{padding:"11px 13px",background:T.surface2,border:`1px solid ${T.border}`,borderLeft:`3px solid ${item.priority==="HIGH"?T.red:T.amber}`,borderRadius:8,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <Badge color={item.priority==="HIGH"?T.red:T.amber} bg={item.priority==="HIGH"?T.redSoft:T.amberSoft} border={item.priority==="HIGH"?T.redMid:T.amberMid} size={10}>{item.priority}</Badge>
                  <span style={{fontSize:11,color:T.text3,fontFamily:"'IBM Plex Mono',monospace"}}>{item.sku}</span>
                  <RiskTypeBadge type={item.riskType}/>
                </div>
                <span style={{fontSize:10,color:T.red,background:T.redSoft,border:`1px solid ${T.redMid}`,borderRadius:4,padding:"1px 6px"}}>{item.deadline}</span>
              </div>
              <div style={{fontSize:13,fontWeight:600,color:T.text1}}>{item.name} — {item.action}</div>
              <div style={{fontSize:11,color:T.text2,marginTop:2}}>📈 {item.impact}</div>
            </div>
          ))}
        </div>
        <AIInsightPanel/>
      </div>
    </div>
  );
}