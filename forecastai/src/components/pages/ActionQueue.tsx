'use client'
import React, { useState } from 'react'
import { T, card, sectionTitle, ACTION_ITEMS_FULL } from '@/lib/data'
import { Badge, StatusBadge, RiskTypeBadge, PageHeader, Btn, FilterBar, Select, SearchInput } from '@/components/ui'

export default function PageActionQueue() {
  const [items, setItems]       = useState(ACTION_ITEMS_FULL);
  const [approved, setApproved] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [modId, setModId]       = useState(null);
  const [note, setNote]         = useState("");
  const [selected, setSelected] = useState([]);
  const [statusF, setStatusF]   = useState("전체");
  const [priorF, setPriorF]     = useState("전체");

  const pending  = items.filter(i=>i.status==="미처리").length;
  const review   = items.filter(i=>i.status==="검토중").length;
  const deadlineW03 = items.filter(i=>i.deadline==="W03 마감").length;

  const pStyle = { HIGH:{bg:T.redSoft,color:T.red,border:T.redMid,bar:T.red}, MED:{bg:T.amberSoft,color:T.amber,border:T.amberMid,bar:T.amber}, LOW:{bg:T.surface2,color:T.text3,border:T.border,bar:T.borderMid} };
  const rColor = { 결품:T.red, 납기:T.orange, 과잉:T.blue, 마진:T.purple };

  const doApprove = (id) => {
    setApproved(p=>[...p,id]);
    setTimeout(()=>setItems(p=>p.map(i=>i.id===id?{...i,status:"완료"}:i)), 600);
  };
  const doBulk = () => { selected.forEach(id=>doApprove(id)); setSelected([]); };

  const filtered = items.filter(i=>{
    const ms = statusF==="전체" || i.status===statusF;
    const mp = priorF==="전체"  || i.priority===priorF;
    return ms && mp;
  });

  return (
    <div>
      <PageHeader title="생산 권고" sub="AI 생산 조정 권고 검토 및 승인"/>

      {/* Summary stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[["미처리", pending, T.red, T.redSoft, T.redMid],["검토중", review, T.amber, T.amberSoft, T.amberMid],["W03 마감", deadlineW03, T.orange, T.orangeSoft, T.orangeMid]].map(([lbl,val,c,bg,bd])=>(
          <div key={lbl} style={{ ...card, padding:"16px 20px" }}>
            <div style={{ fontSize:28, fontWeight:800, color:c, fontFamily:"'IBM Plex Mono',monospace" }}>{val}</div>
            <div style={{ fontSize:12, color:T.text3, marginTop:4 }}>{lbl}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <Select value={statusF} onChange={setStatusF} options={["전체","미처리","검토중","완료"]}/>
        <Select value={priorF}  onChange={setPriorF}  options={["전체","HIGH","MED","LOW"]}/>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {selected.length>0 && <Btn variant="success" onClick={doBulk}>✓ 선택 일괄 승인 ({selected.length}건)</Btn>}
        </div>
      </FilterBar>

      {/* Card list */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {filtered.map(item=>{
          const isApp = approved.includes(item.id) || item.status==="완료";
          const ps    = pStyle[item.priority];
          const isExp = expanded===item.id;
          const isSel = selected.includes(item.id);
          return (
            <div key={item.id} style={{
              ...card, padding:"16px 20px",
              borderLeft:`4px solid ${isApp?T.green:ps.bar}`,
              background:isApp?T.greenSoft:isSel?T.blueSoft:T.surface,
              border:`1px solid ${isApp?T.greenMid:isSel?T.blueMid:T.border}`,
              borderLeft:`4px solid ${isApp?T.green:ps.bar}`,
              opacity:isApp?0.75:1, transition:"all 0.3s",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, flex:1 }}>
                  {!isApp && (
                    <input type="checkbox" checked={isSel} onChange={e=>setSelected(p=>e.target.checked?[...p,item.id]:p.filter(x=>x!==item.id))}
                      style={{ marginTop:2, accentColor:T.blue, width:14, height:14, flexShrink:0 }}/>
                  )}
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                      <Badge color={ps.color} bg={ps.bg} border={ps.border} size={10}>{item.priority}</Badge>
                      <span style={{ fontSize:11, color:T.text3, fontFamily:"'IBM Plex Mono',monospace" }}>{item.sku}</span>
                      <RiskTypeBadge type={item.riskType}/>
                      <span style={{ fontSize:11, color:T.text3 }}>라인 {item.line}</span>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text1, marginBottom:4 }}>{item.name} — {item.action}</div>
                    <div style={{ fontSize:13, color:T.text2 }}>🤖 {item.detail}</div>
                    <div style={{ fontSize:12, color:T.green, fontWeight:600, marginTop:4 }}>📈 예상 효과: {item.impact}</div>

                    {isExp && (
                      <div style={{ marginTop:14, padding:"14px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.text2, lineHeight:1.8 }}>
                        <div style={{ fontWeight:700, color:T.text1, marginBottom:8 }}>📊 AI 판단 근거</div>
                        <div>• 최근 4주 평균 소모: 380 EA/주</div>
                        <div>• 고객 A사 W3 확정 발주: 1,200 EA</div>
                        <div>• 현재 재고: 420 EA → 소진 예상 D+12</div>
                        <div>• 공급사 리드타임: 18일</div>
                        <div>• P90 수요 예측: 4,480 EA (W1 기준)</div>
                        <div style={{ marginTop:10, padding:"8px 10px", background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:6, color:T.blue }}>
                          ⓘ 이 분석은 최근 8주 실적 + P50 예측 기반으로 생성되었습니다.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:10, fontWeight:600, background:item.deadline.includes("W03")?T.redSoft:T.surface2, color:item.deadline.includes("W03")?T.red:T.text3, border:`1px solid ${item.deadline.includes("W03")?T.redMid:T.border}`, borderRadius:5, padding:"2px 8px" }}>{item.deadline}</span>
                  <StatusBadge status={item.status}/>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}` }}>
                <button onClick={()=>setExpanded(isExp?null:item.id)} style={{ fontSize:12, color:T.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600, padding:0 }}>
                  근거 보기 {isExp?"▲":"→"}
                </button>
                <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                  {isApp ? <Badge color={T.green} bg={T.greenSoft} border={T.greenMid}>✓ 처리 완료</Badge> : (
                    <>
                      <Btn variant="success" onClick={()=>doApprove(item.id)}>✓ 승인</Btn>
                      <Btn variant="secondary" onClick={()=>setModId(item.id)}>✏ 수정 요청</Btn>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI 채택률 */}
      <div style={{ ...card, marginTop:20, padding:"14px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:600, color:T.text2 }}>AI 추천 채택률</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:16, fontWeight:800, color:T.amber, fontFamily:"'IBM Plex Mono',monospace" }}>78%</span>
            <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid}>⚠ 관찰</Badge>
            <span style={{ fontSize:11, color:T.text3 }}>목표 80%</span>
          </div>
        </div>
        <div style={{ height:8, background:T.surface2, borderRadius:4, border:`1px solid ${T.border}` }}>
          <div style={{ width:"78%", height:"100%", background:`linear-gradient(90deg,${T.blue},#60A5FA)`, borderRadius:4 }}/>
        </div>
      </div>

      {/* Modify modal */}
      {modId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setModId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:28, width:380, boxShadow:"0 20px 48px rgba(15,23,42,0.18)" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:3 }}>수정 요청</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:20 }}>{ACTION_ITEMS_FULL.find(i=>i.id===modId)?.sku} — {ACTION_ITEMS_FULL.find(i=>i.id===modId)?.name}</div>
            <div style={{ fontSize:12, color:T.text2, fontWeight:600, marginBottom:6 }}>수정 사유 (필수)</div>
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 원자재 수급 문제, 설비 점검 일정 등 수정 사유를 입력해 주세요."
              style={{ width:"100%", height:90, background:T.surface2, border:`1px solid ${T.borderMid}`, borderRadius:7, color:T.text1, fontSize:12, padding:"10px 12px", resize:"none", boxSizing:"border-box", outline:"none", lineHeight:1.6 }}/>
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <Btn variant="secondary" onClick={()=>setModId(null)} style={{ flex:1 }}>취소</Btn>
              <Btn onClick={()=>{setModId(null);setNote("");}} style={{ flex:2 }}>수정 요청 전송</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}