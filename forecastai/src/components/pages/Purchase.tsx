'use client'
import React from 'react'
import { T, card, PURCHASE_ITEMS } from '@/lib/data'
import { Badge, PageHeader, Btn, FilterBar, Select, Table } from '@/components/ui'

export default function PagePurchase() {
  const total = PURCHASE_ITEMS.reduce((a,b)=>a+b.qty*b.price,0);
  return (
    <div>
      <PageHeader title="구매 권고" sub="AI 기반 원자재·부품 구매 권고 (MVP 미리보기)"
        action={<Btn variant="secondary">📥 구매 목록 내보내기</Btn>}/>
      <div style={{ padding:"10px 16px", background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:8, fontSize:12, color:T.blue, marginBottom:20, fontWeight:500 }}>
        ⓘ AI가 이번 주 발주를 권고하는 품목입니다. 구매팀에 전달하기 전 검토해 주세요.
      </div>
      <FilterBar>
        <Select value="전체 공급사" onChange={()=>{}} options={["전체 공급사","S공급사","K공업","J화학","H전자"]}/>
        <Select value="전체 긴급도" onChange={()=>{}} options={["전체 긴급도","긴급","권고","검토"]}/>
        <span style={{ marginLeft:"auto", fontSize:13, fontWeight:600, color:T.text1 }}>
          이번 주 예상 발주액: <span style={{ color:T.blue, fontFamily:"'IBM Plex Mono',monospace" }}>₩{(total/1000000).toFixed(1)}M</span>
        </span>
      </FilterBar>
      <div style={card}>
        <Table
          headers={["품목 코드","품목명","공급사","권고 수량","단가","발주 금액","발주 마감","긴급도"]}
          rows={PURCHASE_ITEMS.map(p=>({ cells:[
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:T.text3 }}>{p.code}</span>,
            <span style={{ fontWeight:600, color:T.text1 }}>{p.name}</span>,
            <span style={{ color:T.text2 }}>{p.supplier}</span>,
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:600 }}>{p.qty.toLocaleString()} {p.unit}</span>,
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:T.text2 }}>₩{p.price.toLocaleString()}</span>,
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, color:T.blue }}>₩{(p.qty*p.price/1000000).toFixed(1)}M</span>,
            <span style={{ fontSize:12, color:T.text2 }}>{p.deadline}</span>,
            p.urgency==="긴급" ? <Badge color={T.red}   bg={T.redSoft}   border={T.redMid}>긴급</Badge>
            : p.urgency==="권고" ? <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid}>권고</Badge>
            : <Badge color={T.text3} bg={T.surface2} border={T.border}>검토</Badge>,
          ]}))}
        />
        <div style={{ display:"flex", justifyContent:"flex-end", padding:"14px 14px 0", borderTop:`1px solid ${T.border}`, marginTop:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color:T.text1 }}>합계: <span style={{ color:T.blue, fontFamily:"'IBM Plex Mono',monospace" }}>₩{(total/1000000).toFixed(1)}M</span></span>
        </div>
      </div>
      <div style={{ marginTop:14, padding:"10px 14px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, fontSize:11, color:T.text3 }}>
        ⓘ MVP 미리보기: 상세 구매 워크플로우 및 공급사 포털 연동은 다음 버전에서 제공됩니다.
      </div>
    </div>
  );
}