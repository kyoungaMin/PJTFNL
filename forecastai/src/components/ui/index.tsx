'use client'
import React from 'react'
import { T, card } from '@/lib/data'

function Badge({ children, color=T.blue, bg=T.blueSoft, border=T.blueMid, size=11 }) {
  return (
    <span style={{ fontSize:size, fontWeight:600, color, background:bg, border:`1px solid ${border}`, borderRadius:5, padding:"2px 8px", display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = {
    "미처리":{ color:T.red,   bg:T.redSoft,    border:T.redMid   },
    "검토중": { color:T.amber, bg:T.amberSoft,  border:T.amberMid },
    "완료":   { color:T.green, bg:T.greenSoft,  border:T.greenMid },
    "처리중": { color:T.amber, bg:T.amberSoft,  border:T.amberMid },
    "자동복구":{ color:T.blue, bg:T.blueSoft,   border:T.blueMid  },
    "해결":   { color:T.green, bg:T.greenSoft,  border:T.greenMid },
    "활성":   { color:T.green, bg:T.greenSoft,  border:T.greenMid },
    "비활성": { color:T.text3, bg:T.surface2,   border:T.border   },
  }[status] || { color:T.text3, bg:T.surface2, border:T.border };
  return <Badge color={m.color} bg={m.bg} border={m.border}>{status}</Badge>;
}

function GradeBadge({ grade }) {
  const colors = { A:"#10B981", B:"#84CC16", C:"#F59E0B", D:"#F97316", E:"#EF4444", F:"#7C3AED" };
  const bgs    = { A:T.greenSoft, B:"#F7FEE7", C:T.amberSoft, D:T.orangeSoft, E:T.redSoft, F:T.purpleSoft };
  const c = colors[grade] || T.text3;
  return <span style={{ fontSize:11, fontWeight:800, color:c, background:bgs[grade], border:`1px solid ${c}30`, borderRadius:4, padding:"2px 7px" }}>{grade}</span>;
}

function RiskTypeBadge({ type }) {
  const m = { 결품:T.red, 납기:T.orange, 과잉:T.blue, 마진:T.purple };
  const c = m[type] || T.text3;
  return <span style={{ fontSize:10, fontWeight:600, color:c, background:`${c}15`, borderRadius:4, padding:"2px 6px" }}>{type}</span>;
}

function ScoreBar({ score }) {
  const color = score>=80 ? T.purple : score>=60 ? T.red : score>=40 ? T.amber : T.green;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:60, height:6, background:T.surface2, borderRadius:3 }}>
        <div style={{ width:`${score}%`, height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:700, color, fontFamily:"'IBM Plex Mono',monospace", minWidth:24 }}>{score}</span>
    </div>
  );
}

function Sparkline({ data, color, inverse=false }) {
  const min=Math.min(...data), max=Math.max(...data), h=28, w=64;
  const pts = data.map((v,i) => {
    const x=(i/(data.length-1))*w, y=h-((v-min)/(max-min||1))*h*0.82-h*0.09;
    return `${x},${y}`;
  }).join(" ");
  const trend=data[data.length-1]-data[0];
  const dotC = inverse?(trend<0?T.green:T.red):(trend>0?T.green:T.red);
  const lx=w, ly=h-((data[data.length-1]-min)/(max-min||1))*h*0.82-h*0.09;
  return (
    <svg width={w} height={h} style={{overflow:"visible",flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lx} cy={ly} r="3" fill={dotC} stroke="white" strokeWidth="1.5"/>
    </svg>
  );
}

function PageHeader({ title, sub, action }: { title: any; sub: any; action?: any }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
      <div>
        <h1 style={{ fontSize:20, fontWeight:800, color:T.text1, letterSpacing:"-0.02em" }}>{title}</h1>
        {sub && <div style={{ fontSize:12, color:T.text3, marginTop:4 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Btn({ children, variant="primary", onClick=undefined, style:s={} }: any) {
  const base = { fontSize:12, fontWeight:700, borderRadius:7, padding:"8px 16px", cursor:"pointer", border:"none", transition:"filter 0.15s" };
  const variants = {
    primary:   { ...base, background:T.blue,     color:"#fff",    boxShadow:"0 2px 8px rgba(37,99,235,0.28)" },
    secondary: { ...base, background:T.surface2, color:T.text2,   border:`1px solid ${T.border}` },
    ghost:     { ...base, background:"none",     color:T.blue,    padding:"8px 0" },
    danger:    { ...base, background:T.redSoft,  color:T.red,     border:`1px solid ${T.redMid}` },
    success:   { ...base, background:T.greenSoft,color:T.green,   border:`1px solid ${T.greenMid}` },
  };
  return <button onClick={onClick} style={{...variants[variant],...s}}>{children}</button>;
}

function FilterBar({ children }) {
  return <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>{children}</div>;
}

function Select({ label=undefined, value, onChange, options }: any) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{
      fontSize:12, color:T.text1, background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:7, padding:"6px 28px 6px 10px", cursor:"pointer", outline:"none",
      appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:"no-repeat", backgroundPosition:"right 8px center",
    }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

function SearchInput({ value, onChange, placeholder="검색..." }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"6px 12px" }}>
      <span style={{ fontSize:12 }}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ border:"none", outline:"none", fontSize:12, color:T.text1, background:"transparent", width:160 }}/>
    </div>
  );
}

function Table({ headers, rows, onRowClick=undefined }: any) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:T.surface2, borderBottom:`2px solid ${T.border}` }}>
            {headers.map((h,i) => (
              <th key={i} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:T.text3, letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i} onClick={()=>onRowClick && onRowClick(row)}
              style={{ borderBottom:`1px solid ${T.border}`, cursor:onRowClick?"pointer":"default", transition:"background 0.1s" }}
              onMouseEnter={e=>{ if(onRowClick) e.currentTarget.style.background=T.surface2; }}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              {row.cells.map((cell,j) => (
                <td key={j} style={{ padding:"11px 14px", color:T.text2, verticalAlign:"middle" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { card, Badge, StatusBadge, GradeBadge, RiskTypeBadge, ScoreBar, Sparkline, PageHeader, Btn, FilterBar, Select, SearchInput, Table }
