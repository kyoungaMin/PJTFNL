// ─── Design Tokens ──────────────────────────────────────────────────────────
export const T = {
  pageBg:'#F0F4F8', surface:'#FFFFFF', surface2:'#F8FAFC', surface3:'#F1F5F9',
  border:'#E2E8F0', borderMid:'#CBD5E1',
  sidebarBg:'#1B2B4B', sidebarBd:'#243659', sidebarTxt:'#94A8C8', sidebarSub:'#5B7299',
  text1:'#0F172A', text2:'#475569', text3:'#94A3B8',
  blue:'#2563EB', blueSoft:'#EFF6FF', blueMid:'#DBEAFE',
  green:'#059669', greenSoft:'#ECFDF5', greenMid:'#D1FAE5',
  amber:'#D97706', amberSoft:'#FFFBEB', amberMid:'#FEF3C7',
  red:'#DC2626', redSoft:'#FEF2F2', redMid:'#FEE2E2',
  purple:'#7C3AED', purpleSoft:'#F5F3FF', purpleMid:'#EDE9FE',
  orange:'#EA580C', orangeSoft:'#FFF7ED', orangeMid:'#FFEDD5',
}

export const card: React.CSSProperties = {
  background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)',
}

export const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 16,
}

// ─── Types ───────────────────────────────────────────────────────────────────
export type RoleType = 'Admin' | 'Manager' | 'Analyst' | 'Viewer'

export interface Member {
  id: number; name: string; role: RoleType; dept: string;
  email: string; grad: string; initial: string;
}

// ─── Dashboard KPI ────────────────────────────────────────────────────────────
export const KPI_DATA = [
  { id:'order',    label:'구매 발주 필요',  value:'4건',  target:'이번 주',   status:'risk',  trend:[2,3,2,4,3,4],       detail:'즉시 처리 필요', inverse:false },
  { id:'coverage', label:'재고 커버리지',   value:'18일', target:'목표 21일', status:'watch', trend:[22,20,19,21,19,18], detail:'목표까지 3일',   inverse:true  },
  { id:'aiaction', label:'AI 생산 권고',    value:'3건',  target:'미처리',    status:'watch', trend:[1,2,1,3,2,3],       detail:'승인 대기 중',   inverse:false },
  { id:'urgent',   label:'긴급 대응 SKU',   value:'2종',  target:'E·F 등급',  status:'risk',  trend:[0,1,1,2,1,2],       detail:'즉시 조치 필요', inverse:false },
]

export const REVENUE_FORECAST = [
  {m:"'24.01",p50:4820,p10:3900,p90:5900,actual:4750},{m:"'24.02",p50:5100,p10:4100,p90:6200,actual:5230},
  {m:"'24.03",p50:5400,p10:4400,p90:6600,actual:5180},{m:"'24.04",p50:4900,p10:3800,p90:6100,actual:4870},
  {m:"'24.05",p50:5200,p10:4100,p90:6400,actual:5320},{m:"'24.06",p50:5600,p10:4500,p90:6900,actual:5710},
  {m:"'24.07",p50:5300,p10:4100,p90:6600,actual:5190},{m:"'24.08",p50:5500,p10:4300,p90:6800,actual:5620},
  {m:"'24.09",p50:5800,p10:4600,p90:7100,actual:5940},{m:"'24.10",p50:5650,p10:4400,p90:7000,actual:5480},
  {m:"'24.11",p50:5900,p10:4700,p90:7200,actual:6020},{m:"'24.12",p50:6100,p10:4900,p90:7500,actual:6230},
  {m:"'25.01",p50:6300,p10:5000,p90:7800},{m:"'25.02",p50:6600,p10:5200,p90:8100},{m:"'25.03",p50:7000,p10:5500,p90:8600},
]

export const RISK_DONUT = [
  {grade:'A',count:187,color:'#10B981'},{grade:'B',count:143,color:'#84CC16'},
  {grade:'C',count:89,color:'#F59E0B'},{grade:'D',count:45,color:'#F97316'},
  {grade:'E',count:28,color:'#EF4444'},{grade:'F',count:12,color:'#7C3AED'},
]

export const MAPE_TREND = [
  {w:'W-11',mape:14.2},{w:'W-10',mape:13.8},{w:'W-9',mape:13.1},{w:'W-8',mape:13.5},
  {w:'W-7',mape:12.9},{w:'W-6',mape:12.6},{w:'W-5',mape:13.2},{w:'W-4',mape:12.8},
  {w:'W-3',mape:12.5},{w:'W-2',mape:12.1},{w:'W-1',mape:12.4},{w:'W0',mape:12.4},
]

export const WEEKLY_FORECAST_DATA = [
  {w:'W-4',p50:3050,p10:2400,p90:3800,actual:3050},{w:'W-3',p50:3200,p10:2500,p90:3950,actual:3180},
  {w:'W-2',p50:3100,p10:2400,p90:3900,actual:3090},{w:'W-1',p50:3300,p10:2600,p90:4100,actual:3250},
  {w:'W1',p50:3320,p10:2280,p90:4480},{w:'W2',p50:3500,p10:2410,p90:4700},
  {w:'W3',p50:3750,p10:2600,p90:5000},{w:'W4',p50:3900,p10:2700,p90:5200},
  {w:'W5',p50:4100,p10:2850,p90:5500},{w:'W6',p50:4200,p10:2900,p90:5600},
  {w:'W7',p50:4050,p10:2750,p90:5400},{w:'W8',p50:3900,p10:2650,p90:5200},
]

export const MONTHLY_FORECAST_DATA = [
  {m:'2월',p50:32100,p10:26000,p90:40000,fx:1320,sox:4650},{m:'3월',p50:35400,p10:28000,p90:44000,fx:1335,sox:4720},
  {m:'4월',p50:29800,p10:23000,p90:38000,fx:1358,sox:4580},{m:'5월',p50:31200,p10:25000,p90:39000,fx:1342,sox:4680},
  {m:'6월',p50:33500,p10:27000,p90:42000,fx:1325,sox:4810},{m:'7월',p50:34100,p10:28000,p90:43000,fx:1310,sox:4900},
]

export const RISK_ITEMS = [
  {id:1,sku:'SKU-0421',name:'A타입 반도체 커넥터',score:87,grade:'F',type:'결품',action:'즉시 발주 권고',      status:'미처리',factory:'수원 1공장',line:'L-3',stock:420, safeStock:1500,leadTime:18,customer:'A사'},
  {id:2,sku:'SKU-1183',name:'B소켓',              score:79,grade:'E',type:'납기',action:'생산 우선순위 상향',  status:'검토중',factory:'수원 1공장',line:'L-2',stock:890, safeStock:1200,leadTime:12,customer:'B사'},
  {id:3,sku:'SKU-0887',name:'C마운트',             score:74,grade:'E',type:'과잉',action:'생산 감량 권고',      status:'미처리',factory:'수원 2공장',line:'L-1',stock:8200,safeStock:2000,leadTime:7, customer:'C사'},
  {id:4,sku:'SKU-2201',name:'D리드',               score:61,grade:'D',type:'마진',action:'단가 재협의',          status:'완료',  factory:'수원 1공장',line:'L-4',stock:1200,safeStock:800, leadTime:21,customer:'A사'},
  {id:5,sku:'SKU-0312',name:'E핀',                 score:55,grade:'D',type:'결품',action:'안전재고 상향',        status:'미처리',factory:'수원 2공장',line:'L-2',stock:650, safeStock:1000,leadTime:14,customer:'D사'},
  {id:6,sku:'SKU-0991',name:'F커넥터',             score:48,grade:'C',type:'납기',action:'납기 재조정',          status:'검토중',factory:'수원 1공장',line:'L-1',stock:1800,safeStock:1500,leadTime:10,customer:'B사'},
  {id:7,sku:'SKU-1450',name:'G소켓베이스',         score:38,grade:'C',type:'과잉',action:'판매 촉진 검토',       status:'미처리',factory:'수원 2공장',line:'L-3',stock:5400,safeStock:1800,leadTime:9, customer:'C사'},
  {id:8,sku:'SKU-0744',name:'H터미널',             score:22,grade:'B',type:'마진',action:'원가 분석 권고',       status:'완료',  factory:'수원 1공장',line:'L-2',stock:2100,safeStock:1600,leadTime:16,customer:'A사'},
]

export const ACTION_ITEMS_FULL = [
  {id:1,priority:'HIGH',sku:'SKU-0421',name:'A타입 반도체 커넥터',action:'생산 증량 권고',    detail:'3,000EA → 4,200EA', impact:'결품 위험 제거 · 납기준수율 +12%p',deadline:'W03 마감',riskType:'결품',status:'미처리',line:'L-3'},
  {id:2,priority:'HIGH',sku:'SKU-1183',name:'B소켓',              action:'생산 우선순위 상향',detail:'L-2 라인 선행 배치',impact:'납기 D-3일 → D+0 회복',           deadline:'W03 마감',riskType:'납기',status:'미처리',line:'L-2'},
  {id:3,priority:'MED', sku:'SKU-0887',name:'C마운트',             action:'생산 감량 권고',    detail:'이번 주 -500EA 감축',impact:'보관비용 월 -₩2.1M',              deadline:'W04 마감',riskType:'과잉',status:'검토중',line:'L-1'},
  {id:4,priority:'MED', sku:'SKU-0312',name:'E핀',                 action:'안전재고 상향',     detail:'650EA → 1,000EA',  impact:'결품 확률 -32%',                  deadline:'W04 마감',riskType:'결품',status:'미처리',line:'L-2'},
  {id:5,priority:'LOW', sku:'SKU-0991',name:'F커넥터',             action:'납기 재조정',       detail:'고객 협의 후 D+7',  impact:'생산 평준화 개선',                 deadline:'W05 마감',riskType:'납기',status:'미처리',line:'L-1'},
]

export const PURCHASE_ITEMS = [
  {id:1,code:'MAT-0041',name:'실리콘 A타입',supplier:'S공급사',qty:5000, unit:'EA',price:4200, urgency:'긴급',deadline:'1/17'},
  {id:2,code:'MAT-0117',name:'커넥터 핀',   supplier:'K공업',  qty:12000,unit:'EA',price:850,  urgency:'권고',deadline:'1/20'},
  {id:3,code:'MAT-0088',name:'에폭시 수지', supplier:'J화학',  qty:800,  unit:'kg',price:8500, urgency:'권고',deadline:'1/22'},
  {id:4,code:'MAT-0203',name:'PCB 기판',    supplier:'H전자',  qty:2000, unit:'EA',price:12400,urgency:'검토',deadline:'1/25'},
  {id:5,code:'MAT-0055',name:'납땜 와이어', supplier:'S공급사',qty:300,  unit:'kg',price:6800, urgency:'검토',deadline:'1/28'},
]

export const USERS = [
  {id:1,name:'나기업',email:'na@company.com',  role:'Manager' as RoleType,dept:'생산계획팀',lastLogin:'오늘 09:03',status:'활성'},
  {id:2,name:'김분석',email:'kim@company.com', role:'Analyst' as RoleType,dept:'생산계획팀',lastLogin:'오늘 08:51',status:'활성'},
  {id:3,name:'이뷰어',email:'lee@company.com', role:'Viewer'  as RoleType,dept:'구매팀',    lastLogin:'어제',      status:'활성'},
  {id:4,name:'박관리',email:'park@company.com',role:'Admin'   as RoleType,dept:'IT팀',      lastLogin:'오늘 07:30',status:'활성'},
  {id:5,name:'최계획',email:'choi@company.com',role:'Manager' as RoleType,dept:'생산계획팀',lastLogin:'2일 전',    status:'활성'},
  {id:6,name:'정구매',email:'jung@company.com',role:'Analyst' as RoleType,dept:'구매팀',    lastLogin:'3일 전',    status:'활성'},
  {id:7,name:'한뷰어',email:'han@company.com', role:'Viewer'  as RoleType,dept:'경영지원팀',lastLogin:'1주 전',    status:'비활성'},
]

// ─── Inventory ───────────────────────────────────────────────────────────────
export const INV_ITEMS = [
  {sku:'SKU-0421',name:'A타입 반도체 커넥터',category:'커넥터',stock:420, safeStock:1500,unitCost:8200, weeklyDemand:380,leadTime:18,customer:'A사',grade:'F'},
  {sku:'SKU-1183',name:'B소켓',              category:'소켓',  stock:890, safeStock:1200,unitCost:3400, weeklyDemand:290,leadTime:12,customer:'B사',grade:'E'},
  {sku:'SKU-0887',name:'C마운트',             category:'마운트',stock:8200,safeStock:2000,unitCost:1200, weeklyDemand:250,leadTime:7, customer:'C사',grade:'E'},
  {sku:'SKU-2201',name:'D리드',               category:'리드',  stock:1200,safeStock:800, unitCost:5600, weeklyDemand:180,leadTime:21,customer:'A사',grade:'D'},
  {sku:'SKU-0312',name:'E핀',                 category:'핀',    stock:650, safeStock:1000,unitCost:920,  weeklyDemand:210,leadTime:14,customer:'D사',grade:'D'},
  {sku:'SKU-0991',name:'F커넥터',             category:'커넥터',stock:1800,safeStock:1500,unitCost:4100, weeklyDemand:170,leadTime:10,customer:'B사',grade:'C'},
  {sku:'SKU-1450',name:'G소켓베이스',         category:'소켓',  stock:5400,safeStock:1800,unitCost:2800, weeklyDemand:140,leadTime:9, customer:'C사',grade:'C'},
  {sku:'SKU-0744',name:'H터미널',             category:'기타',  stock:2100,safeStock:1600,unitCost:3200, weeklyDemand:160,leadTime:16,customer:'A사',grade:'B'},
  {sku:'SKU-0555',name:'I캡',                 category:'기타',  stock:3800,safeStock:1200,unitCost:680,  weeklyDemand:120,leadTime:8, customer:'B사',grade:'A'},
  {sku:'SKU-0632',name:'J블록',               category:'기타',  stock:2600,safeStock:900, unitCost:4500, weeklyDemand:95, leadTime:11,customer:'D사',grade:'A'},
]

export const INV_TREND = [
  {w:'W-11',total:28400,safe:18000},{w:'W-10',total:27800,safe:18000},{w:'W-9',total:29100,safe:18000},
  {w:'W-8', total:26500,safe:18000},{w:'W-7', total:27200,safe:18000},{w:'W-6',total:28900,safe:18000},
  {w:'W-5', total:25800,safe:18000},{w:'W-4', total:24600,safe:18000},{w:'W-3',total:26300,safe:18000},
  {w:'W-2', total:25100,safe:18000},{w:'W-1', total:27400,safe:18000},{w:'W0', total:26060,safe:18000},
]

// ─── External Indicators ─────────────────────────────────────────────────────
export const EXT_SEMI_DATA = [
  {d:'1월',sox:4210,dram:3.20,nand:4.10},{d:'2월',sox:4380,dram:3.45,nand:4.30},{d:'3월',sox:4520,dram:3.60,nand:4.55},
  {d:'4월',sox:4180,dram:3.30,nand:4.20},{d:'5월',sox:4650,dram:3.75,nand:4.70},{d:'6월',sox:4820,dram:3.90,nand:4.85},
  {d:'7월',sox:4720,dram:3.82,nand:4.78},{d:'8월',sox:4950,dram:4.05,nand:5.10},{d:'9월',sox:5100,dram:4.20,nand:5.25},
  {d:'10월',sox:5230,dram:4.35,nand:5.40},{d:'11월',sox:5180,dram:4.28,nand:5.32},{d:'12월',sox:5380,dram:4.50,nand:5.60},
]
export const EXT_GLOBAL_DATA = [
  {d:'1월',ipi:98.2,pmi:49.8,hs8541:1820},{d:'2월',ipi:98.8,pmi:50.2,hs8541:1950},{d:'3월',ipi:99.5,pmi:51.0,hs8541:2180},
  {d:'4월',ipi:98.1,pmi:49.5,hs8541:1740},{d:'5월',ipi:100.2,pmi:51.8,hs8541:2250},{d:'6월',ipi:101.0,pmi:52.3,hs8541:2380},
  {d:'7월',ipi:100.5,pmi:51.9,hs8541:2290},{d:'8월',ipi:101.8,pmi:52.8,hs8541:2450},{d:'9월',ipi:102.3,pmi:53.1,hs8541:2580},
  {d:'10월',ipi:102.8,pmi:53.5,hs8541:2640},{d:'11월',ipi:103.2,pmi:53.9,hs8541:2710},{d:'12월',ipi:104.0,pmi:54.2,hs8541:2820},
]
export const EXT_FX_DATA = [
  {d:'1월',usd:1285,eur:1410,rate:3.50},{d:'2월',usd:1310,eur:1435,rate:3.50},{d:'3월',usd:1335,eur:1458,rate:3.50},
  {d:'4월',usd:1358,eur:1482,rate:3.75},{d:'5월',usd:1342,eur:1465,rate:3.75},{d:'6월',usd:1325,eur:1448,rate:3.50},
  {d:'7월',usd:1310,eur:1432,rate:3.50},{d:'8월',usd:1328,eur:1451,rate:3.25},{d:'9월',usd:1315,eur:1440,rate:3.25},
  {d:'10월',usd:1340,eur:1462,rate:3.00},{d:'11월',usd:1355,eur:1478,rate:3.00},{d:'12월',usd:1342,eur:1465,rate:3.00},
]
export const EXT_SUPPLY_DATA = [
  {d:'1월',bdi:1820,freight:1250},{d:'2월',bdi:1950,freight:1320},{d:'3월',bdi:2100,freight:1410},
  {d:'4월',bdi:1980,freight:1380},{d:'5월',bdi:2180,freight:1480},{d:'6월',bdi:2050,freight:1420},
  {d:'7월',bdi:1920,freight:1360},{d:'8월',bdi:2250,freight:1550},{d:'9월',bdi:2380,freight:1620},
  {d:'10월',bdi:2420,freight:1680},{d:'11월',bdi:2310,freight:1590},{d:'12월',bdi:2450,freight:1710},
]
export const EXT_RAW_DATA = [
  {d:'1월',copper:8450,wti:72.5,gold:2010},{d:'2월',copper:8720,wti:74.2,gold:2035},{d:'3월',copper:8950,wti:76.8,gold:2080},
  {d:'4월',copper:8680,wti:75.3,gold:2060},{d:'5월',copper:9120,wti:78.1,gold:2110},{d:'6월',copper:8890,wti:76.5,gold:2090},
  {d:'7월',copper:8650,wti:74.8,gold:2070},{d:'8월',copper:9280,wti:79.2,gold:2150},{d:'9월',copper:9450,wti:80.5,gold:2180},
  {d:'10월',copper:9580,wti:81.2,gold:2210},{d:'11월',copper:9380,wti:79.8,gold:2190},{d:'12월',copper:9620,wti:82.0,gold:2230},
]

// ─── Simulation ───────────────────────────────────────────────────────────────
export const SIM_SKUS = [
  {id:'SKU-0421',name:'A타입 반도체 커넥터',safeStock:2659,currentStock:420, leadTime:18,weeklyDemand:380,productionCap:500},
  {id:'SKU-1183',name:'B소켓',              safeStock:1200,currentStock:890, leadTime:12,weeklyDemand:290,productionCap:420},
  {id:'SKU-0887',name:'C마운트',             safeStock:2000,currentStock:8200,leadTime:7, weeklyDemand:250,productionCap:350},
  {id:'SKU-2201',name:'D리드',               safeStock:800, currentStock:1200,leadTime:21,weeklyDemand:180,productionCap:280},
  {id:'SKU-0312',name:'E핀',                 safeStock:1000,currentStock:650, leadTime:14,weeklyDemand:210,productionCap:300},
]
export const SIM_CUSTOMERS = ['전체 고객사','A사','B사','C사','D사']
export const SIM_PERIODS   = [4,8,12]
export const AI_PRESETS = [
  {id:'shortage',label:'결품 방지 시나리오',  badge:'HIGH',badgeColor:'red',
   desc:'SKU-0421 긴급 증산 + 안전재고 상향으로 D+12 결품 위험 제거',
   params:{demandDelta:15,productionDelta:28,safetyBuffer:30,orderQty:3000,leadTimeDelta:0}},
  {id:'balanced',label:'균형 최적화 시나리오',badge:'권고',badgeColor:'blue',
   desc:'생산·재고 균형점 찾기 — 비용 최소화 + 납기 준수율 95% 유지',
   params:{demandDelta:5,productionDelta:12,safetyBuffer:15,orderQty:1500,leadTimeDelta:-1}},
  {id:'lean',    label:'린 재고 시나리오',    badge:'검토',badgeColor:'amber',
   desc:'과잉 재고 SKU 감량 + 보관비 절감 — 리스크 허용 범위 내',
   params:{demandDelta:-8,productionDelta:-10,safetyBuffer:0,orderQty:500,leadTimeDelta:2}},
]

// ─── Auth / Members ───────────────────────────────────────────────────────────
export const ALL_MEMBERS: Member[] = [
  {id:1,name:'나기업',role:'Manager',dept:'생산계획팀',email:'na@company.com',  grad:'linear-gradient(135deg,#3B82F6,#7C3AED)',initial:'나'},
  {id:2,name:'김분석',role:'Analyst',dept:'생산계획팀',email:'kim@company.com', grad:'linear-gradient(135deg,#10B981,#059669)',initial:'김'},
  {id:3,name:'박관리',role:'Admin',  dept:'IT팀',      email:'park@company.com',grad:'linear-gradient(135deg,#7C3AED,#EC4899)',initial:'박'},
  {id:4,name:'최계획',role:'Manager',dept:'생산계획팀',email:'choi@company.com',grad:'linear-gradient(135deg,#F59E0B,#EF4444)',initial:'최'},
  {id:5,name:'정구매',role:'Analyst',dept:'구매팀',    email:'jung@company.com',grad:'linear-gradient(135deg,#06B6D4,#3B82F6)',initial:'정'},
]

export const LOGIN_ACCOUNTS = [
  {email:'na@company.com',  password:'1234',member:ALL_MEMBERS[0]},
  {email:'kim@company.com', password:'1234',member:ALL_MEMBERS[1]},
  {email:'park@company.com',password:'1234',member:ALL_MEMBERS[2]},
  {email:'choi@company.com',password:'1234',member:ALL_MEMBERS[3]},
  {email:'jung@company.com',password:'1234',member:ALL_MEMBERS[4]},
]

export const ROLE_LABEL: Record<RoleType,string> = {
  Admin:'관리자', Manager:'팀장', Analyst:'분석가', Viewer:'뷰어',
}

export const NAV_STRUCTURE = [
  {id:'dashboard',       label:'대시보드',     dot:'#93C5FD'},
  {id:'inventory',       label:'재고 현황',    parent:'재고 관리', dot:'#93C5FD'},
  {id:'risk',            label:'리스크 관리',  parent:'재고 관리', dot:'#FCA5A5',badge:40},
  {id:'weekly-forecast', label:'주간 예측',    parent:'수요예측',  dot:'#93C5FD'},
  {id:'monthly-forecast',label:'월간 예측',    parent:'수요예측',  dot:'#93C5FD'},
  {id:'action-queue',    label:'생산 권고',    parent:'최적화',    dot:'#93C5FD',badge:3},
  {id:'purchase',        label:'구매 권고',    parent:'최적화',    dot:'#93C5FD'},
  {id:'simulation',      label:'시나리오 분석',parent:'최적화',    dot:'#93C5FD'},
  {id:'ext-semi',        label:'산업 지표',    parent:'외부 지표', dot:'#93C5FD'},
  {id:'ext-global',      label:'글로벌 수요',  parent:'외부 지표', dot:'#93C5FD'},
  {id:'ext-fx',          label:'환율 / 금리',  parent:'외부 지표', dot:'#93C5FD'},
  {id:'ext-supply',      label:'물류',         parent:'외부 지표', dot:'#93C5FD'},
  {id:'ext-raw',         label:'원자재',       parent:'외부 지표', dot:'#93C5FD'},
  {id:'admin',           label:'관리자',       dot:'#93C5FD'},
]

export const SEARCH_INDEX = [
  {type:'SKU',   label:'SKU-0421',       sub:'A타입 반도체 커넥터',page:'risk'},
  {type:'SKU',   label:'SKU-1183',       sub:'B소켓',              page:'risk'},
  {type:'고객',  label:'A사',            sub:'전체 SKU 87종',      page:'weekly-forecast'},
  {type:'고객',  label:'B사',            sub:'전체 SKU 54종',      page:'weekly-forecast'},
  {type:'페이지',label:'대시보드',       sub:'KPI 현황',           page:'dashboard'},
  {type:'페이지',label:'리스크 관리',    sub:'위험 품목 진단',     page:'risk'},
  {type:'페이지',label:'생산 권고',      sub:'AI 생산 조정 권고',  page:'action-queue'},
  {type:'페이지',label:'구매 권고',      sub:'AI 발주 권고',       page:'purchase'},
  {type:'페이지',label:'산업 지표',      sub:'SOX·DRAM·NAND',      page:'ext-semi'},
  {type:'페이지',label:'글로벌 수요',    sub:'IPI·PMI·HS8541',     page:'ext-global'},
  {type:'페이지',label:'환율 / 금리',    sub:'KRW/USD·기준금리',   page:'ext-fx'},
  {type:'페이지',label:'물류',           sub:'BDI·해상운임',       page:'ext-supply'},
  {type:'페이지',label:'원자재',         sub:'구리·WTI·금',        page:'ext-raw'},
  {type:'페이지',label:'예측 시뮬레이션',sub:'시나리오 분석',      page:'simulation'},
]

export const TK: Record<string,{c:string,bg:string,b:string}> = {
  SKU:   {c:T.blue,  bg:T.blueSoft,  b:T.blueMid},
  고객:  {c:T.green, bg:T.greenSoft, b:T.greenMid},
  페이지:{c:T.purple,bg:T.purpleSoft,b:T.purpleMid},
}

export const CAT_COLORS: Record<string,string> = {
  커넥터:'#2563EB', 소켓:'#7C3AED', 마운트:'#0D9488',
  리드:'#D97706', 핀:'#EA580C', 기타:'#94A3B8',
}
