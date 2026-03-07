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

/* ─── Purchase Recommendation (구매 권고) Mock ─── */
export const PURCHASE_PLAN_DATA = [
  { id:1, componentId:'00001-B010001', componentName:'실리콘 고무 컴파운드', category:'원자재',
    parentProducts:'SL-301S, 5080W', grossRequirement:8500, currentInventory:1200, pendingPo:500,
    netRequirement:6800, safetyStock:2000, reorderPoint:3500,
    recommendedQty:7200, orderMethod:'eoq' as const,
    supplier:'01016', supplierName:'(주)그로피아', leadDays:14, unitPrice:27836, orderAmount:200419200,
    altSupplier:'02355', altSupplierName:'(주)대한화성',
    latestOrderDate:'02/24', expectedReceiptDate:'03/10', needDate:'03/13',
    urgency:'critical' as const, description:'BOM 소요량 대비 재고 부족 — 즉시 발주 필요', status:'pending' as const },
  { id:2, componentId:'00001-B010005', componentName:'카본블랙 마스터배치', category:'원자재',
    parentProducts:'INS-1271, KI-100', grossRequirement:5200, currentInventory:-300, pendingPo:0,
    netRequirement:5500, safetyStock:1500, reorderPoint:2800,
    recommendedQty:5800, orderMethod:'lot_for_lot' as const,
    supplier:'02355', supplierName:'(주)대한화성', leadDays:18, unitPrice:15400, orderAmount:89320000,
    altSupplier:'01016', altSupplierName:'(주)그로피아',
    latestOrderDate:'02/23', expectedReceiptDate:'03/13', needDate:'03/12',
    urgency:'critical' as const, description:'재고 마이너스 — 긴급 발주 필수', status:'pending' as const },
  { id:3, componentId:'00001-B020003', componentName:'에폭시 수지 A타입', category:'부자재',
    parentProducts:'5080W, ASMM-65', grossRequirement:4100, currentInventory:1800, pendingPo:200,
    netRequirement:2100, safetyStock:1000, reorderPoint:1800,
    recommendedQty:2500, orderMethod:'eoq' as const,
    supplier:'01789', supplierName:'삼화화학(주)', leadDays:12, unitPrice:8500, orderAmount:21250000,
    altSupplier:'02066', altSupplierName:'(주)한국화학',
    latestOrderDate:'02/26', expectedReceiptDate:'03/10', needDate:'03/11',
    urgency:'high' as const, description:'안전재고 접근 중 — 리드타임 고려 선제 발주', status:'pending' as const },
  { id:4, componentId:'00001-B020010', componentName:'경화제 B-7', category:'부자재',
    parentProducts:'SL-301S, INS-1271', grossRequirement:3600, currentInventory:900, pendingPo:400,
    netRequirement:2300, safetyStock:800, reorderPoint:1500,
    recommendedQty:2600, orderMethod:'eoq' as const,
    supplier:'01016', supplierName:'(주)그로피아', leadDays:10, unitPrice:12400, orderAmount:32240000,
    altSupplier:'03308', altSupplierName:'(주)케미솔',
    latestOrderDate:'02/27', expectedReceiptDate:'03/09', needDate:'03/10',
    urgency:'high' as const, description:'순소요 발생 — EOQ 기준 발주', status:'pending' as const },
  { id:5, componentId:'00001-B030015', componentName:'충전제 CaCO3', category:'원자재',
    parentProducts:'KI-100, 5080W, SL-301S', grossRequirement:6200, currentInventory:3500, pendingPo:1000,
    netRequirement:1700, safetyStock:1200, reorderPoint:2400,
    recommendedQty:2000, orderMethod:'eoq' as const,
    supplier:'02066', supplierName:'(주)한국화학', leadDays:8, unitPrice:4200, orderAmount:8400000,
    altSupplier:'01789', altSupplierName:'삼화화학(주)',
    latestOrderDate:'03/01', expectedReceiptDate:'03/09', needDate:'03/13',
    urgency:'medium' as const, description:'재고 충분하나 ROP 접근 — 선제 보충', status:'pending' as const },
  { id:6, componentId:'00001-B030022', componentName:'가소제 DOP', category:'원자재',
    parentProducts:'ASMM-65, INS-1271', grossRequirement:2800, currentInventory:2100, pendingPo:300,
    netRequirement:400, safetyStock:600, reorderPoint:1100,
    recommendedQty:800, orderMethod:'lot_for_lot' as const,
    supplier:'03308', supplierName:'(주)케미솔', leadDays:7, unitPrice:6800, orderAmount:5440000,
    altSupplier:'02355', altSupplierName:'(주)대한화성',
    latestOrderDate:'03/03', expectedReceiptDate:'03/10', needDate:'03/13',
    urgency:'medium' as const, description:'소량 순소요 — Lot-for-Lot 발주', status:'pending' as const },
  { id:7, componentId:'01016-D010128', componentName:'AS-112 O-Ring', category:'부자재',
    parentProducts:'노즐 2.3-3.2', grossRequirement:3000, currentInventory:10, pendingPo:0,
    netRequirement:2990, safetyStock:800, reorderPoint:1500,
    recommendedQty:3200, orderMethod:'eoq' as const,
    supplier:'01016', supplierName:'(주)그로피아', leadDays:15, unitPrice:3200, orderAmount:10240000,
    altSupplier:'02066', altSupplierName:'(주)한국화학',
    latestOrderDate:'02/25', expectedReceiptDate:'03/12', needDate:'03/10',
    urgency:'high' as const, description:'재고 거의 소진 — 긴급 보충 필요', status:'pending' as const },
  { id:8, componentId:'00001-B040001', componentName:'이형제 실리콘', category:'소모품',
    parentProducts:'SL-301S, 5080W, KI-100', grossRequirement:1500, currentInventory:2800, pendingPo:0,
    netRequirement:0, safetyStock:400, reorderPoint:700,
    recommendedQty:500, orderMethod:'fixed_period' as const,
    supplier:'02355', supplierName:'(주)대한화성', leadDays:5, unitPrice:9500, orderAmount:4750000,
    altSupplier:'03308', altSupplierName:'(주)케미솔',
    latestOrderDate:'03/08', expectedReceiptDate:'03/13', needDate:'03/15',
    urgency:'low' as const, description:'순소요 없으나 정기 보충 시기 도래', status:'pending' as const },
  { id:9, componentId:'00001-B040008', componentName:'포장재 PE필름', category:'소모품',
    parentProducts:'전 제품', grossRequirement:800, currentInventory:5200, pendingPo:200,
    netRequirement:0, safetyStock:300, reorderPoint:500,
    recommendedQty:0, orderMethod:'eoq' as const,
    supplier:'01789', supplierName:'삼화화학(주)', leadDays:3, unitPrice:2100, orderAmount:0,
    altSupplier:'02066', altSupplierName:'(주)한국화학',
    latestOrderDate:'-', expectedReceiptDate:'-', needDate:'-',
    urgency:'low' as const, description:'재고 충분 — 발주 불필요', status:'pending' as const },
  { id:10, componentId:'00001-B020018', componentName:'접착제 에폭시B', category:'부자재',
    parentProducts:'노즐 3.5-4.7', grossRequirement:1800, currentInventory:600, pendingPo:800,
    netRequirement:400, safetyStock:350, reorderPoint:700,
    recommendedQty:500, orderMethod:'lot_for_lot' as const,
    supplier:'02066', supplierName:'(주)한국화학', leadDays:9, unitPrice:11200, orderAmount:5600000,
    altSupplier:'01789', altSupplierName:'삼화화학(주)',
    latestOrderDate:'03/02', expectedReceiptDate:'03/11', needDate:'03/13',
    urgency:'medium' as const, description:'미입고 PO 감안 시 소량 추가 발주', status:'pending' as const },
]

export const PURCHASE_SUPPLIER_CHART = [
  { supplier:'(주)그로피아', amount: 242899200 },
  { supplier:'(주)대한화성', amount: 99510000 },
  { supplier:'삼화화학(주)', amount: 21250000 },
  { supplier:'(주)한국화학', amount: 14000000 },
  { supplier:'(주)케미솔', amount: 5440000 },
]

export const PURCHASE_URGENCY_DIST = [
  { name:'Critical', value:2, color:'#DC2626' },
  { name:'High',     value:3, color:'#EA580C' },
  { name:'Medium',   value:3, color:'#D97706' },
  { name:'Low',      value:2, color:'#059669' },
]

export const ORDER_METHOD_LABELS: Record<string, { label:string, color:string, bg:string, border:string }> = {
  eoq:          { label:'EOQ',  color:T.blue,   bg:T.blueSoft,   border:T.blueMid },
  lot_for_lot:  { label:'L4L',  color:T.purple, bg:T.purpleSoft, border:T.purpleMid },
  fixed_period: { label:'정기',  color:T.green,  bg:T.greenSoft,  border:T.greenMid },
}

export const URGENCY_STYLE: Record<string, { label:string, color:string, bg:string, border:string, bar:string }> = {
  critical: { label:'긴급', color:T.red,   bg:T.redSoft,    border:T.redMid,   bar:T.red },
  high:     { label:'높음', color:T.orange,bg:T.orangeSoft, border:T.orangeMid,bar:T.orange },
  medium:   { label:'보통', color:T.amber, bg:T.amberSoft,  border:T.amberMid, bar:T.amber },
  low:      { label:'낮음', color:T.green, bg:T.greenSoft,  border:T.greenMid, bar:T.green },
}

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

// ─── Production Plan (S7) ────────────────────────────────────────────────────
export const PRODUCTION_PLAN_DATA = [
  { id:1, sku:'SKU-0421', name:'A타입 반도체 커넥터', line:'L-3',
    demandP50:3320, demandP90:4480, currentStock:420, safetyStock:1500,
    dailyCapacity:500, maxCapacity:600, plannedQty:4200, minQty:3800, maxQty:4800,
    priority:'critical' as const, planType:'increase' as const,
    riskGrade:'F', stockoutRisk:87, excessRisk:5,
    targetStart:'03/07', targetEnd:'03/13',
    description:'P90 수요 기반 증산 — 재고 소진 D+12 예상',
    status:'draft' as const, riskType:'결품', customer:'A사',
    aiReason:{ avgConsume:380, openOrder:1200, depletionDay:12, leadTime:18, p90Demand:4480 }},
  { id:2, sku:'SKU-1183', name:'B소켓', line:'L-2',
    demandP50:2900, demandP90:3650, currentStock:890, safetyStock:1200,
    dailyCapacity:420, maxCapacity:500, plannedQty:3400, minQty:3000, maxQty:3800,
    priority:'critical' as const, planType:'increase' as const,
    riskGrade:'E', stockoutRisk:79, excessRisk:8,
    targetStart:'03/07', targetEnd:'03/13',
    description:'고객 B사 긴급 발주 반영 — L-2 선행 배치',
    status:'draft' as const, riskType:'납기', customer:'B사',
    aiReason:{ avgConsume:290, openOrder:800, depletionDay:21, leadTime:12, p90Demand:3650 }},
  { id:3, sku:'SKU-0887', name:'C마운트', line:'L-1',
    demandP50:2500, demandP90:3200, currentStock:8200, safetyStock:2000,
    dailyCapacity:350, maxCapacity:420, plannedQty:1800, minQty:1500, maxQty:2200,
    priority:'low' as const, planType:'decrease' as const,
    riskGrade:'E', stockoutRisk:12, excessRisk:74,
    targetStart:'03/07', targetEnd:'03/13',
    description:'과잉 재고 감산 — 보관비 월 ₩2.1M 절감 예상',
    status:'approved' as const, riskType:'과잉', customer:'C사',
    aiReason:{ avgConsume:250, openOrder:400, depletionDay:230, leadTime:7, p90Demand:3200 }},
  { id:4, sku:'SKU-2201', name:'D리드', line:'L-4',
    demandP50:1800, demandP90:2400, currentStock:1200, safetyStock:800,
    dailyCapacity:280, maxCapacity:340, plannedQty:1960, minQty:1700, maxQty:2200,
    priority:'medium' as const, planType:'maintain' as const,
    riskGrade:'D', stockoutRisk:45, excessRisk:18,
    targetStart:'03/07', targetEnd:'03/13',
    description:'마진 리스크 주의 — 단가 재협의 병행 권고',
    status:'draft' as const, riskType:'마진', customer:'A사',
    aiReason:{ avgConsume:180, openOrder:350, depletionDay:47, leadTime:21, p90Demand:2400 }},
  { id:5, sku:'SKU-0312', name:'E핀', line:'L-2',
    demandP50:2100, demandP90:2850, currentStock:650, safetyStock:1000,
    dailyCapacity:300, maxCapacity:360, plannedQty:2800, minQty:2400, maxQty:3200,
    priority:'high' as const, planType:'increase' as const,
    riskGrade:'D', stockoutRisk:55, excessRisk:10,
    targetStart:'03/07', targetEnd:'03/13',
    description:'안전재고 하회 — 650EA → 목표 1,000EA 회복',
    status:'draft' as const, riskType:'결품', customer:'D사',
    aiReason:{ avgConsume:210, openOrder:600, depletionDay:22, leadTime:14, p90Demand:2850 }},
  { id:6, sku:'SKU-0991', name:'F커넥터', line:'L-1',
    demandP50:1700, demandP90:2280, currentStock:1800, safetyStock:1500,
    dailyCapacity:320, maxCapacity:380, plannedQty:2240, minQty:1900, maxQty:2500,
    priority:'medium' as const, planType:'maintain' as const,
    riskGrade:'C', stockoutRisk:32, excessRisk:20,
    targetStart:'03/07', targetEnd:'03/13',
    description:'납기 재조정 필요 — 고객 협의 후 D+7 권고',
    status:'draft' as const, riskType:'납기', customer:'B사',
    aiReason:{ avgConsume:170, openOrder:500, depletionDay:74, leadTime:10, p90Demand:2280 }},
  { id:7, sku:'SKU-1450', name:'G소켓베이스', line:'L-3',
    demandP50:1400, demandP90:1900, currentStock:5400, safetyStock:1800,
    dailyCapacity:280, maxCapacity:340, plannedQty:980, minQty:800, maxQty:1200,
    priority:'low' as const, planType:'decrease' as const,
    riskGrade:'C', stockoutRisk:8, excessRisk:65,
    targetStart:'03/07', targetEnd:'03/13',
    description:'판매 촉진 검토 — 3개월 초과 재고',
    status:'approved' as const, riskType:'과잉', customer:'C사',
    aiReason:{ avgConsume:140, openOrder:200, depletionDay:270, leadTime:9, p90Demand:1900 }},
  { id:8, sku:'SKU-0744', name:'H터미널', line:'L-2',
    demandP50:1600, demandP90:2150, currentStock:2100, safetyStock:1600,
    dailyCapacity:260, maxCapacity:310, plannedQty:1820, minQty:1500, maxQty:2100,
    priority:'medium' as const, planType:'maintain' as const,
    riskGrade:'B', stockoutRisk:18, excessRisk:22,
    targetStart:'03/07', targetEnd:'03/13',
    description:'현 수준 유지 — 재고·수요 균형 양호',
    status:'executed' as const, riskType:'마진', customer:'A사',
    aiReason:{ avgConsume:160, openOrder:300, depletionDay:92, leadTime:16, p90Demand:2150 }},
  { id:9, sku:'SKU-0555', name:'I캡', line:'L-4',
    demandP50:1200, demandP90:1650, currentStock:3800, safetyStock:1200,
    dailyCapacity:240, maxCapacity:290, plannedQty:840, minQty:700, maxQty:1000,
    priority:'low' as const, planType:'decrease' as const,
    riskGrade:'A', stockoutRisk:5, excessRisk:48,
    targetStart:'03/07', targetEnd:'03/13',
    description:'재고 충분 — 소폭 감산 검토',
    status:'executed' as const, riskType:'과잉', customer:'B사',
    aiReason:{ avgConsume:120, openOrder:150, depletionDay:220, leadTime:8, p90Demand:1650 }},
  { id:10, sku:'SKU-0632', name:'J블록', line:'L-4',
    demandP50:950, demandP90:1300, currentStock:2600, safetyStock:900,
    dailyCapacity:200, maxCapacity:240, plannedQty:1050, minQty:900, maxQty:1200,
    priority:'high' as const, planType:'increase' as const,
    riskGrade:'A', stockoutRisk:15, excessRisk:12,
    targetStart:'03/07', targetEnd:'03/13',
    description:'신규 고객 D사 수주 증가 대응',
    status:'draft' as const, riskType:'납기', customer:'D사',
    aiReason:{ avgConsume:95, openOrder:450, depletionDay:190, leadTime:11, p90Demand:1300 }},
]

export const PRODUCTION_LINE_CHART = [
  { day:'월', 'L-1':420, 'L-2':380, 'L-3':510, 'L-4':290 },
  { day:'화', 'L-1':450, 'L-2':410, 'L-3':480, 'L-4':310 },
  { day:'수', 'L-1':380, 'L-2':420, 'L-3':520, 'L-4':270 },
  { day:'목', 'L-1':440, 'L-2':390, 'L-3':500, 'L-4':300 },
  { day:'금', 'L-1':460, 'L-2':400, 'L-3':490, 'L-4':280 },
  { day:'토', 'L-1':200, 'L-2':180, 'L-3':250, 'L-4':120 },
  { day:'일', 'L-1':0,   'L-2':0,   'L-3':0,   'L-4':0   },
]

export const PROD_PRIORITY_DIST = [
  { name:'Critical', value:2, color:T.red },
  { name:'High',     value:3, color:T.orange },
  { name:'Medium',   value:3, color:T.amber },
  { name:'Low',      value:2, color:T.green },
]

export const PLAN_TYPE_LABELS: Record<string,{label:string,color:string,bg:string,border:string}> = {
  increase: { label:'증산', color:T.red,   bg:T.redSoft,   border:T.redMid   },
  decrease: { label:'감산', color:T.blue,  bg:T.blueSoft,  border:T.blueMid  },
  maintain: { label:'유지', color:T.amber, bg:T.amberSoft, border:T.amberMid },
  new:      { label:'신규', color:T.purple,bg:T.purpleSoft,border:T.purpleMid },
}

export const PRIORITY_STYLE: Record<string,{label:string,color:string,bg:string,border:string,bar:string}> = {
  critical: { label:'CRITICAL', color:T.red,    bg:T.redSoft,    border:T.redMid,    bar:T.red    },
  high:     { label:'HIGH',     color:T.orange, bg:T.orangeSoft, border:T.orangeMid, bar:T.orange },
  medium:   { label:'MED',      color:T.amber,  bg:T.amberSoft,  border:T.amberMid,  bar:T.amber  },
  low:      { label:'LOW',      color:T.text3,  bg:T.surface2,   border:T.border,    bar:T.borderMid },
}

// ─── Simulation ───────────────────────────────────────────────────────────────
export const SIM_SKUS = [
  {id:'00001-A010174',name:'AS-370[RX]',      spec:'208.92*5.33_5080W', safeStock:2800,currentStock:420, leadTime:14,weeklyDemand:5960,productionCap:900},
  {id:'00001-A010029',name:'AS-111[R1]',      spec:'10.77*2.62_5080W',  safeStock:1500,currentStock:380, leadTime:14,weeklyDemand:2720,productionCap:450},
  {id:'00692-D090003',name:'AL2011 접시렌치',  spec:'#10-24*12.8',       safeStock:1000,currentStock:550, leadTime:14,weeklyDemand:1980,productionCap:350},
  {id:'01016-D010447',name:'AS-326',           spec:'AS-326 [F-972]',    safeStock:750, currentStock:1800,leadTime:14,weeklyDemand:1510,productionCap:280},
  {id:'00001-A010003',name:'AS-007[R1]',       spec:'3.68*1.78_5080W',   safeStock:600, currentStock:320, leadTime:14,weeklyDemand:1280,productionCap:230},
]
export const SIM_CUSTOMERS = ['전체 고객사']
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

export function runSimulation(sku: typeof SIM_SKUS[number], params: {demandDelta:number,productionDelta:number,safetyBuffer:number,orderQty:number,leadTimeDelta:number}, weeks: number) {
  const demand = Math.round(sku.weeklyDemand * (1 + params.demandDelta / 100));
  const production = Math.round(sku.productionCap * (1 + params.productionDelta / 100));
  const safe = Math.round(sku.safeStock * (1 + params.safetyBuffer / 100));
  const leadWeek = Math.max(1, Math.ceil((sku.leadTime + params.leadTimeDelta) / 7));
  const result: {w:string, asis:number, tobe:number, safe:number}[] = [];
  let asisStock = sku.currentStock;
  let tobeStock = sku.currentStock;
  for (let i = 1; i <= weeks; i++) {
    asisStock = asisStock - sku.weeklyDemand + sku.productionCap;
    tobeStock = tobeStock - demand + production + (i === leadWeek ? params.orderQty : 0);
    result.push({ w: `W${i}`, asis: Math.round(asisStock), tobe: Math.round(tobeStock), safe });
  }
  return result;
}

// ─── Industry Scenarios ──────────────────────────────────────────────────────
export const INDUSTRY_SCENARIOS = [
  { id:'dram-surge', label:'DRAM/NAND 가격 급등', icon:'📈', category:'수요변동' as const, badgeColor:'red' as const,
    desc:'DRAM 스팟가 20%+ 급등 시 수요 위축 + 투입비 상승으로 생산 현상유지', impact:'수요 -15%, 안전재고 상향 필요',
    params:{ demandDelta:-15, productionDelta:0, safetyBuffer:25, orderQty:2000, leadTimeDelta:0 }},
  { id:'supply-disruption', label:'공급망 차질 (해운 지연)', icon:'🚢', category:'공급위험' as const, badgeColor:'orange' as const,
    desc:'주요 해운 경로 지연으로 리드타임 증가 및 원자재 입고 지연에 따른 부분 감산', impact:'리드타임 +7일, 생산 -10%',
    params:{ demandDelta:0, productionDelta:-10, safetyBuffer:30, orderQty:2500, leadTimeDelta:7 }},
  { id:'bulk-order', label:'대형 고객사 긴급 수주', icon:'📋', category:'수요변동' as const, badgeColor:'purple' as const,
    desc:'주요 고객사 대량 수주 발생 시 긴급 증산 및 자재 선행 확보 필요', impact:'수요 +40%, 즉시 증산 필요',
    params:{ demandDelta:40, productionDelta:35, safetyBuffer:20, orderQty:5000, leadTimeDelta:0 }},
  { id:'raw-material-shortage', label:'원자재 부족 (구리/실리콘)', icon:'⛏️', category:'원자재' as const, badgeColor:'red' as const,
    desc:'구리/실리콘 공급 부족으로 원자재 확보 어려움, 생산 차질 우려', impact:'생산능력 -20%, 대체 자재 검토 필요',
    params:{ demandDelta:0, productionDelta:-20, safetyBuffer:35, orderQty:1000, leadTimeDelta:5 }},
  { id:'fx-spike', label:'환율 급등 (USD/KRW)', icon:'💱', category:'외부환경' as const, badgeColor:'amber' as const,
    desc:'USD/KRW 1,400원 돌파 시 원자재 수입비용 상승, 마진 압박', impact:'원가 +10%, 발주량 최적화 필요',
    params:{ demandDelta:-5, productionDelta:-8, safetyBuffer:10, orderQty:500, leadTimeDelta:2 }},
  { id:'seasonal-peak', label:'계절 수요 피크 (Q4)', icon:'🎄', category:'수요변동' as const, badgeColor:'blue' as const,
    desc:'Q4 연말 성수기 수요 급증, 공급사 납기 지연 동반 — 선행 재고 확보 필수', impact:'수요 +25%, 리드타임 +2일',
    params:{ demandDelta:25, productionDelta:20, safetyBuffer:15, orderQty:3000, leadTimeDelta:2 }},
  { id:'equipment-maintenance', label:'설비 정기 보수', icon:'🔧', category:'공급위험' as const, badgeColor:'amber' as const,
    desc:'분기 설비 정기 보수로 생산능력 일시 감소, 사전 재고 확보 필요', impact:'생산능력 -25%, 2주간 감산',
    params:{ demandDelta:0, productionDelta:-25, safetyBuffer:20, orderQty:2000, leadTimeDelta:0 }},
  { id:'competitor-exit', label:'경쟁사 시장 철수', icon:'🏢', category:'수요변동' as const, badgeColor:'green' as const,
    desc:'경쟁사 철수로 시장 점유율 확대 기회, 수요 증가 대비 필요', impact:'수요 +30%, 생산 라인 증설 검토',
    params:{ demandDelta:30, productionDelta:25, safetyBuffer:10, orderQty:3500, leadTimeDelta:0 }},
]

export const CATEGORY_COLORS: Record<string,{c:string,bg:string,b:string}> = {
  수요변동: {c:T.blue,  bg:T.blueSoft,  b:T.blueMid},
  공급위험: {c:T.orange,bg:T.orangeSoft,b:T.orangeMid},
  원자재:   {c:T.red,   bg:T.redSoft,   b:T.redMid},
  외부환경: {c:T.amber, bg:T.amberSoft, b:T.amberMid},
}

export const RADAR_AXES = [
  { key:'inventoryStability', label:'재고안정성', fullMark:100 },
  { key:'costEfficiency',     label:'비용효율',   fullMark:100 },
  { key:'deliveryRate',       label:'납기준수',   fullMark:100 },
  { key:'stockoutRisk',       label:'결품위험',   fullMark:100 },
  { key:'productionEfficiency', label:'생산효율', fullMark:100 },
]

export const SENSITIVITY_VARIABLES = [
  { key:'demandDelta',     label:'수요 변동률',   unit:'%',   testRange:[-20,20] as [number,number], color:T.blue },
  { key:'productionDelta', label:'생산량 조정',   unit:'%',   testRange:[-20,20] as [number,number], color:T.green },
  { key:'safetyBuffer',    label:'안전재고 버퍼', unit:'%',   testRange:[0,40]   as [number,number], color:T.purple },
  { key:'orderQty',        label:'추가 발주량',   unit:' EA', testRange:[0,4000] as [number,number], color:T.orange },
  { key:'leadTimeDelta',   label:'리드타임 조정', unit:'일',  testRange:[-7,7]   as [number,number], color:T.amber },
]

export const SENSITIVITY_KPIS = [
  { key:'finalStock',    label:'최종재고' },
  { key:'stockoutWeeks', label:'결품주수' },
  { key:'costDelta',     label:'비용변동' },
  { key:'deliveryRate',  label:'납기준수율' },
]

type SimParams = { demandDelta:number, productionDelta:number, safetyBuffer:number, orderQty:number, leadTimeDelta:number }

export function calcRadarScores(sku: typeof SIM_SKUS[number], params: SimParams, period: number) {
  const simData = runSimulation(sku, params, period)
  const safeStock = Math.round(sku.safeStock * (1 + params.safetyBuffer / 100))
  const zeroWeeks = simData.filter(d => d.tobe <= 0).length
  const lastTobe = simData[simData.length - 1]?.tobe ?? 0
  const avgTobe = simData.reduce((s, d) => s + d.tobe, 0) / simData.length
  return {
    inventoryStability: Math.min(100, Math.max(0, Math.round((avgTobe / Math.max(safeStock,1)) * 50))),
    costEfficiency: Math.min(100, Math.max(0, Math.round(80 - Math.abs(params.productionDelta) * 1.5 - (params.orderQty / 100)))),
    deliveryRate: zeroWeeks === 0 ? 95 : Math.max(30, 95 - zeroWeeks * 15),
    stockoutRisk: Math.min(100, Math.max(0, 100 - zeroWeeks * 20 - (lastTobe <= 0 ? 30 : 0))),
    productionEfficiency: Math.min(100, Math.max(0, Math.round(85 - Math.abs(params.productionDelta - params.demandDelta) * 0.8))),
  }
}

function extractKpi(sku: typeof SIM_SKUS[number], params: SimParams, period: number, kpiKey: string): number {
  const simData = runSimulation(sku, params, period)
  const tobeZeroWeeks = simData.filter(d => d.tobe <= 0).length
  const lastTobe = simData[simData.length - 1]?.tobe ?? 0
  switch (kpiKey) {
    case 'finalStock':    return lastTobe
    case 'stockoutWeeks': return tobeZeroWeeks
    case 'costDelta':     return Math.abs(params.productionDelta) * sku.productionCap * 800 + params.orderQty * 500
    case 'deliveryRate':  return tobeZeroWeeks === 0 ? 95 : tobeZeroWeeks <= 1 ? 82 : 63
    default: return 0
  }
}

export function runSensitivity(sku: typeof SIM_SKUS[number], baseParams: SimParams, period: number, targetKpi: string) {
  const baseVal = extractKpi(sku, baseParams, period, targetKpi)
  return SENSITIVITY_VARIABLES.map(v => {
    const lowParams = { ...baseParams, [v.key]: v.testRange[0] }
    const highParams = { ...baseParams, [v.key]: v.testRange[1] }
    const lowVal = extractKpi(sku, lowParams, period, targetKpi)
    const highVal = extractKpi(sku, highParams, period, targetKpi)
    return { variable: v.key, label: v.label, unit: v.unit, color: v.color, low: lowVal, high: highVal, base: baseVal, impact: Math.abs(highVal - lowVal) }
  }).sort((a, b) => b.impact - a.impact)
}

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

export const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  Admin:   { dashboard:true, forecast:true, action:true, dataInput:true, userMgmt:true },
  Manager: { dashboard:true, forecast:true, action:true, dataInput:true, userMgmt:false },
  Analyst: { dashboard:true, forecast:true, action:false,dataInput:true, userMgmt:false },
  Viewer:  { dashboard:true, forecast:false,action:false,dataInput:false,userMgmt:false },
}

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
