'use client'
import React from 'react'
import { LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, EXT_SEMI_DATA, EXT_GLOBAL_DATA, EXT_FX_DATA, EXT_SUPPLY_DATA, EXT_RAW_DATA } from '@/lib/data'
import { PageHeader } from '@/components/ui'

function calcChange(data,key){
  const last=data[data.length-1][key], prev=data[data.length-2][key];
  return {value:last, pct:(last-prev)/prev*100};
}

function TickerCard({label,value,unit,changePct,chartData,dataKey}){
  const up=changePct>=0;
  const vals=chartData.map(x=>x[dataKey]);
  const min=Math.min(...vals), max=Math.max(...vals), range=max-min||1;
  const pts=chartData.map((d,i)=>{
    const x=(i/(chartData.length-1))*80;
    const y=26-((d[dataKey]-min)/range)*22;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:11,color:T.text3,fontWeight:600,marginBottom:6}}>{label}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:T.text1,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}}>
            {typeof value==="number"&&value>100?value.toLocaleString():value}
            <span style={{fontSize:11,color:T.text3,fontWeight:400,marginLeft:3}}>{unit}</span>
          </div>
          <div style={{marginTop:5,display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:12,fontWeight:700,color:up?T.green:T.red}}>{up?"▲":"▼"} {Math.abs(changePct).toFixed(2)}%</span>
            <span style={{fontSize:10,color:T.text3}}>전월비</span>
          </div>
        </div>
        <svg width={82} height={30}><polyline points={pts} fill="none" stroke={up?T.green:T.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </div>
  );
}

function PeriodTable({data,keys,labels,units}){
  const last=data[data.length-1];
  const prev1=data[data.length-2]||data[0];
  const prev4=data.length>=5?data[data.length-5]:data[0];
  const prev12=data[0];
  const Chg=({v})=>{
    const n=parseFloat(v);
    return <span style={{color:n>=0?T.green:T.red,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{n>=0?"▲":"▼"}{Math.abs(n).toFixed(2)}%</span>;
  };
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:T.surface2,borderBottom:`2px solid ${T.border}`}}>
            {["지표","현재값","전월 대비","4주 전 대비","연초 대비"].map(h=>(
              <th key={h} style={{padding:"9px 14px",textAlign:h==="지표"?"left":"right",fontSize:11,fontWeight:700,color:T.text3,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k,i)=>{
            const cur=last[k],p1=prev1[k],p4=prev4[k],p12=prev12[k];
            return (
              <tr key={k} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:"10px 14px",fontWeight:600,color:T.text1}}>
                  {labels[i]}<span style={{fontSize:10,color:T.text3,marginLeft:5,fontWeight:400}}>{units[i]}</span>
                </td>
                <td style={{padding:"10px 14px",textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,color:T.text1}}>{cur.toLocaleString()}</td>
                <td style={{padding:"10px 14px",textAlign:"right"}}><Chg v={((cur-p1)/p1*100).toFixed(2)}/></td>
                <td style={{padding:"10px 14px",textAlign:"right"}}><Chg v={((cur-p4)/p4*100).toFixed(2)}/></td>
                <td style={{padding:"10px 14px",textAlign:"right"}}><Chg v={((cur-p12)/p12*100).toFixed(2)}/></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExtChartCard({title,data,lineKeys,colors,height=155}){
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px 20px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
      <div style={{fontSize:12,fontWeight:700,color:T.text1,marginBottom:12}}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{top:2,right:4,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="d" tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} width={38} tickFormatter={v=>v>=1000?(v/1000).toFixed(1)+"k":v}/>
          <Tooltip contentStyle={{fontSize:11,border:`1px solid ${T.border}`,borderRadius:8}}/>
          {lineKeys.map((k,i)=>(
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2.2} dot={false}
              activeDot={{r:4,fill:colors[i],stroke:"white",strokeWidth:2}}/>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
        {lineKeys.map((k,i)=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.text2}}>
            <div style={{width:14,height:2,background:colors[i],borderRadius:1}}/>{k.toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtLayout({title,sub,tickerItems,chartL,chartR,tableData,tableKeys,tableLabels,tableUnits}){
  return (
    <div>
      <PageHeader title={title} sub={sub}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12,marginBottom:20}}>
        {tickerItems}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        {chartL}{chartR}
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px 20px",boxShadow:"0 1px 4px rgba(15,23,42,0.07)"}}>
        <div style={{fontSize:12,fontWeight:700,color:T.text1,marginBottom:14}}>📊 기간별 변동률</div>
        <PeriodTable data={tableData} keys={tableKeys} labels={tableLabels} units={tableUnits}/>
      </div>
    </div>
  );
}

export function PageExtSemi(){
  const sox=calcChange(EXT_SEMI_DATA,"sox");
  const dram=calcChange(EXT_SEMI_DATA,"dram");
  const nand=calcChange(EXT_SEMI_DATA,"nand");
  return <ExtLayout title="산업 지표" sub="SOX 지수 · DRAM / NAND 현물가 · 반도체 업황"
    tickerItems={[
      <TickerCard key="sox"  label="SOX 지수"    value={sox.value}  unit="pt"    changePct={sox.pct}  chartData={EXT_SEMI_DATA} dataKey="sox"/>,
      <TickerCard key="dram" label="DRAM 현물가"  value={dram.value} unit="$/Gb"  changePct={dram.pct} chartData={EXT_SEMI_DATA} dataKey="dram"/>,
      <TickerCard key="nand" label="NAND 현물가"  value={nand.value} unit="$/GB"  changePct={nand.pct} chartData={EXT_SEMI_DATA} dataKey="nand"/>,
    ]}
    chartL={<ExtChartCard title="SOX 지수 추이" data={EXT_SEMI_DATA} lineKeys={["sox"]} colors={[T.blue]}/>}
    chartR={<ExtChartCard title="DRAM / NAND 현물가" data={EXT_SEMI_DATA} lineKeys={["dram","nand"]} colors={[T.purple,"#0D9488"]}/>}
    tableData={EXT_SEMI_DATA} tableKeys={["sox","dram","nand"]} tableLabels={["SOX 지수","DRAM","NAND"]} tableUnits={["pt","$/Gb","$/GB"]}
  />;
}

export function PageExtGlobal(){
  const ipi=calcChange(EXT_GLOBAL_DATA,"ipi");
  const pmi=calcChange(EXT_GLOBAL_DATA,"pmi");
  const hs=calcChange(EXT_GLOBAL_DATA,"hs8541");
  return <ExtLayout title="글로벌 수요" sub="산업생산지수(IPI) · PMI · HS8541 수출입 통계"
    tickerItems={[
      <TickerCard key="ipi" label="산업생산지수 (IPI)" value={ipi.value} unit=""    changePct={ipi.pct} chartData={EXT_GLOBAL_DATA} dataKey="ipi"/>,
      <TickerCard key="pmi" label="글로벌 PMI"         value={pmi.value} unit=""    changePct={pmi.pct} chartData={EXT_GLOBAL_DATA} dataKey="pmi"/>,
      <TickerCard key="hs"  label="HS8541 수출"         value={hs.value}  unit="$M"  changePct={hs.pct}  chartData={EXT_GLOBAL_DATA} dataKey="hs8541"/>,
    ]}
    chartL={<ExtChartCard title="IPI · PMI 추이" data={EXT_GLOBAL_DATA} lineKeys={["ipi","pmi"]} colors={[T.blue,T.green]}/>}
    chartR={<ExtChartCard title="HS8541 수출 동향" data={EXT_GLOBAL_DATA} lineKeys={["hs8541"]} colors={[T.purple]}/>}
    tableData={EXT_GLOBAL_DATA} tableKeys={["ipi","pmi","hs8541"]} tableLabels={["IPI","PMI","HS8541 수출"]} tableUnits={["","","$M"]}
  />;
}

export function PageExtFX(){
  const usd=calcChange(EXT_FX_DATA,"usd");
  const eur=calcChange(EXT_FX_DATA,"eur");
  const rate=calcChange(EXT_FX_DATA,"rate");
  return <ExtLayout title="환율 / 금리" sub="KRW/USD · KRW/EUR · 한국 기준금리"
    tickerItems={[
      <TickerCard key="usd"  label="KRW / USD" value={usd.value}  unit="원" changePct={usd.pct}  chartData={EXT_FX_DATA} dataKey="usd"/>,
      <TickerCard key="eur"  label="KRW / EUR" value={eur.value}  unit="원" changePct={eur.pct}  chartData={EXT_FX_DATA} dataKey="eur"/>,
      <TickerCard key="rate" label="기준금리"   value={rate.value} unit="%" changePct={rate.pct}  chartData={EXT_FX_DATA} dataKey="rate"/>,
    ]}
    chartL={<ExtChartCard title="환율 추이 (KRW)" data={EXT_FX_DATA} lineKeys={["usd","eur"]} colors={[T.blue,T.purple]}/>}
    chartR={<ExtChartCard title="기준금리 추이" data={EXT_FX_DATA} lineKeys={["rate"]} colors={[T.amber]}/>}
    tableData={EXT_FX_DATA} tableKeys={["usd","eur","rate"]} tableLabels={["KRW/USD","KRW/EUR","기준금리"]} tableUnits={["원","원","%"]}
  />;
}

export function PageExtSupply(){
  const bdi=calcChange(EXT_SUPPLY_DATA,"bdi");
  const frt=calcChange(EXT_SUPPLY_DATA,"freight");
  return <ExtLayout title="물류" sub="BDI 발틱운임지수 · 아시아 해상 운임"
    tickerItems={[
      <TickerCard key="bdi" label="BDI 발틱운임지수"  value={bdi.value} unit="pt" changePct={bdi.pct} chartData={EXT_SUPPLY_DATA} dataKey="bdi"/>,
      <TickerCard key="frt" label="해상 운임 (아시아)" value={frt.value} unit="$"  changePct={frt.pct} chartData={EXT_SUPPLY_DATA} dataKey="freight"/>,
    ]}
    chartL={<ExtChartCard title="BDI 추이" data={EXT_SUPPLY_DATA} lineKeys={["bdi"]} colors={[T.blue]}/>}
    chartR={<ExtChartCard title="해상 운임 추이" data={EXT_SUPPLY_DATA} lineKeys={["freight"]} colors={[T.amber]}/>}
    tableData={EXT_SUPPLY_DATA} tableKeys={["bdi","freight"]} tableLabels={["BDI","해상 운임"]} tableUnits={["pt","$"]}
  />;
}

export function PageExtRaw(){
  const cu=calcChange(EXT_RAW_DATA,"copper");
  const wti=calcChange(EXT_RAW_DATA,"wti");
  const gold=calcChange(EXT_RAW_DATA,"gold");
  return <ExtLayout title="원자재" sub="구리 (LME) · WTI 원유 · 금 (COMEX)"
    tickerItems={[
      <TickerCard key="cu"   label="구리 (LME)" value={cu.value}   unit="$/t"   changePct={cu.pct}   chartData={EXT_RAW_DATA} dataKey="copper"/>,
      <TickerCard key="wti"  label="WTI 원유"   value={wti.value}  unit="$/bbl" changePct={wti.pct}  chartData={EXT_RAW_DATA} dataKey="wti"/>,
      <TickerCard key="gold" label="금 (COMEX)" value={gold.value} unit="$/oz"  changePct={gold.pct} chartData={EXT_RAW_DATA} dataKey="gold"/>,
    ]}
    chartL={<ExtChartCard title="구리 가격 추이" data={EXT_RAW_DATA} lineKeys={["copper"]} colors={[T.orange]}/>}
    chartR={<ExtChartCard title="WTI · 금 추이" data={EXT_RAW_DATA} lineKeys={["wti","gold"]} colors={[T.amber,T.green]}/>}
    tableData={EXT_RAW_DATA} tableKeys={["copper","wti","gold"]} tableLabels={["구리","WTI","금"]} tableUnits={["$/t","$/bbl","$/oz"]}
  />;
}