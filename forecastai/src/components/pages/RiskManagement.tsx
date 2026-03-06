'use client'
import React, { useState } from 'react'
import { T, card, RISK_ITEMS } from '@/lib/data'
import { Badge, StatusBadge, GradeBadge, RiskTypeBadge, ScoreBar,
  PageHeader, Btn, FilterBar, Select, SearchInput, Table } from '@/components/ui'

export default function PageRiskManagement() {
  const [search, setSearch]     = useState("");
  const [gradeF, setGradeF]     = useState("전체");
  const [typeF, setTypeF]       = useState("전체");
  const [drawer, setDrawer]     = useState(null);

  const filtered = RISK_ITEMS.filter(r => {
    const matchSearch = r.sku.includes(search) || r.name.includes(search);
    const matchGrade  = gradeF==="전체" || r.grade===gradeF;
    const matchType   = typeF==="전체"  || r.type===typeF;
    return matchSearch && matchGrade && matchType;
  });

  const gradeCounts = Object.fromEntries(["A","B","C","D","E","F"].map(g=>[g, RISK_ITEMS.filter(r=>r.grade===g).length]));
  const gradeColors = { A:"#10B981",B:"#84CC16",C:"#F59E0B",D:"#F97316",E:"#EF4444",F:"#7C3AED" };

  return (
    <div style={{ position:"relative" }}>
      <PageHeader title="리스크 관리" sub="품목별 재고·납기·마진 위험 자동 진단"
        action={<Btn variant="secondary">📄 리스크 보고서</Btn>}/>

      {/* Grade scoreboard */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:20 }}>
        {["A","B","C","D","E","F"].map(g=>(
          <div key={g} onClick={()=>setGradeF(gradeF===g?"전체":g)} style={{
            ...card, padding:"14px 16px", textAlign:"center", cursor:"pointer",
            background:gradeF===g?`${gradeColors[g]}12`:T.surface,
            border:`1px solid ${gradeF===g?gradeColors[g]+"50":T.border}`,
            transition:"all 0.15s",
          }}>
            <div style={{ fontSize:18, fontWeight:800, color:gradeColors[g], fontFamily:"'IBM Plex Mono',monospace" }}>{gradeCounts[g]}</div>
            <div style={{ fontSize:11, color:T.text3, marginTop:3 }}>Grade {g}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="SKU / 품목명 검색"/>
        <Select value={gradeF}   onChange={setGradeF}   options={["전체","A","B","C","D","E","F"]}/>
        <Select value={typeF}    onChange={setTypeF}    options={["전체","결품","과잉","납기","마진"]}/>
        <Btn variant="secondary" onClick={()=>{setSearch("");setGradeF("전체");setTypeF("전체");}}>초기화</Btn>
        <span style={{ fontSize:11, color:T.text3, marginLeft:"auto" }}>총 {filtered.length}건</span>
      </FilterBar>

      {filtered.some(r=>["E","F"].includes(r.grade)) && (
        <div style={{ padding:"10px 14px", background:T.redSoft, border:`1px solid ${T.redMid}`, borderRadius:8, fontSize:12, color:T.red, fontWeight:500, marginBottom:16 }}>
          ⚠ E~F 등급 {filtered.filter(r=>["E","F"].includes(r.grade)).length}건 — 이번 주 내 조치가 필요합니다.
        </div>
      )}

      <div style={card}>
        <Table
          headers={["SKU 코드","품목명","위험 점수","등급","위험 유형","권고 액션","상태"]}
          onRowClick={row=>setDrawer(row._raw)}
          rows={filtered.map(r=>({ _raw:r, cells:[
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:600,color:T.text2}}>{r.sku}</span>,
            <span style={{fontWeight:600,color:T.text1}}>{r.name}</span>,
            <ScoreBar score={r.score}/>,
            <GradeBadge grade={r.grade}/>,
            <RiskTypeBadge type={r.type}/>,
            <span style={{fontSize:12,color:T.text2}}>{r.action}</span>,
            <StatusBadge status={r.status}/>,
          ]}))}
        />
      </div>

      {/* Drawer */}
      {drawer && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.35)", zIndex:100 }} onClick={()=>setDrawer(null)}/>
          <div style={{ position:"fixed", top:0, right:0, width:440, height:"100vh", background:T.surface, borderLeft:`1px solid ${T.border}`, zIndex:101, overflowY:"auto", boxShadow:"-4px 0 24px rgba(15,23,42,0.12)" }}>
            <div style={{ padding:"24px 24px 0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:11, color:T.text3, fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{drawer.sku}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:T.text1 }}>{drawer.name}</div>
                </div>
                <button onClick={()=>setDrawer(null)} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, width:30, height:30, cursor:"pointer", fontSize:16, color:T.text3 }}>×</button>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                <GradeBadge grade={drawer.grade}/>
                <RiskTypeBadge type={drawer.type}/>
                <StatusBadge status={drawer.status}/>
              </div>

              <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px" , marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:12 }}>위험 점수</div>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                  <div style={{ flex:1, height:10, background:T.border, borderRadius:5 }}>
                    <div style={{ width:`${drawer.score}%`, height:"100%", background:drawer.score>=80?T.purple:drawer.score>=60?T.red:T.amber, borderRadius:5, transition:"width 0.6s" }}/>
                  </div>
                  <span style={{ fontSize:22, fontWeight:800, color:T.text1, fontFamily:"'IBM Plex Mono',monospace" }}>{drawer.score}</span>
                  <span style={{ fontSize:13, color:T.text3 }}>/ 100</span>
                </div>
              </div>

              <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:12 }}>📦 재고 현황</div>
                {[
                  ["현재 재고", `${drawer.stock.toLocaleString()} EA`, drawer.stock < drawer.safeStock],
                  ["안전재고", `${drawer.safeStock.toLocaleString()} EA`, false],
                  ["리드타임", `${drawer.leadTime}일`, false],
                  ["담당 고객사", drawer.customer, false],
                ].map(([k,v,warn])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:12, color:T.text3 }}>{k}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:warn?T.red:T.text1 }}>{v} {warn?"⚠":""}</span>
                  </div>
                ))}
              </div>

              <div style={{ background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:10, padding:"16px", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.blue, marginBottom:10 }}>🤖 AI 권고 액션</div>
                <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:6 }}>{drawer.action}</div>
                <div style={{ fontSize:12, color:T.text2, lineHeight:1.7 }}>
                  <div>• 현재 재고 소진 예상: D+{Math.round(drawer.stock / 380)}일</div>
                  <div>• 고객 발주 확정: 1,200 EA (W3)</div>
                  <div>• 권고 조치 기한: 이번 주 금요일</div>
                </div>
              </div>

              <div style={{ display:"flex", gap:8 }}>
                <Btn variant="success" style={{ flex:1 }}>✓ 승인</Btn>
                <Btn variant="secondary" style={{ flex:1 }}>✏ 수정 요청</Btn>
                <Btn variant="secondary">보류</Btn>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}