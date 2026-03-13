import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type StatusCode = 'all' | 'risk' | 'short' | 'normal' | 'excess'
const INVENTORY_CACHE_TTL_MS = 30_000
const inventoryResponseCache = new Map<string, { expiresAt: number; payload: any }>()
const monthlyInventoryMapCache = new Map<string, { expiresAt: number; invByProduct: Record<string, number> }>()
const monthlyInventoryMapPending = new Map<string, Promise<Record<string, number>>>()
let availableMonthsCache: { expiresAt: number; months: string[] } | null = null
let availableMonthsPending: Promise<string[]> | null = null

async function fetchAll(
  table: string,
  select: string,
  filter: (q: any) => any,
): Promise<any[]> {
  const PAGE = 1000
  const all: any[] = []

  for (let off = 0; ; off += PAGE) {
    const { data, error } = await filter(
      supabase.from(table).select(select).range(off, off + PAGE - 1)
    )

    if (error) throw error
    if (!data?.length) break

    all.push(...data)
    if (data.length < PAGE) break
  }

  return all
}

const IN_BATCH = 300

async function batchIn(
  table: string,
  select: string,
  col: string,
  ids: string[],
  extra?: (q: any) => any,
): Promise<any[]> {
  const all: any[] = []

  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const chunk = ids.slice(i, i + IN_BATCH)
    const rows = await fetchAll(table, select, q => {
      let qq = q.in(col, chunk)
      return extra ? extra(qq) : qq
    })
    all.push(...rows)
  }

  return all
}

function monthLabel(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`
}

function stockStatusPriority(code: StatusCode): number {
  if (code === 'risk') return 0
  if (code === 'short') return 1
  if (code === 'normal') return 2
  if (code === 'excess') return 3
  return 4
}

function classifyInventoryStatus(stock: number, safeStock: number, grade: string): StatusCode {
  if (grade === 'E' || grade === 'F') return 'risk'
  if (grade === 'D') return 'short'

  if (safeStock > 0) {
    if (stock < safeStock * 0.5) return 'risk'
    if (stock < safeStock) return 'short'
    if (stock > safeStock * 3.0) return 'excess'
    return 'normal'
  }

  if (stock <= 0) return 'risk'
  if (stock <= 3) return 'short'
  return 'normal'
}

function getInventoryCacheKey(req: Request) {
  const { pathname, search } = new URL(req.url)
  return `${pathname}${search}`
}

function readInventoryCache(key: string) {
  const hit = inventoryResponseCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    inventoryResponseCache.delete(key)
    return null
  }
  return hit.payload
}

function writeInventoryCache(key: string, payload: any) {
  inventoryResponseCache.set(key, {
    expiresAt: Date.now() + INVENTORY_CACHE_TTL_MS,
    payload,
  })
}

function resolveReferenceDate(referenceMonth: string) {
  if (/^\d{6}$/.test(referenceMonth)) {
    const year = Number(referenceMonth.slice(0, 4))
    const month = Number(referenceMonth.slice(4, 6))
    return new Date(year, month, 0)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(referenceMonth)) {
    const [year, month, day] = referenceMonth.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(referenceMonth)
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function resolveMonthlyRiskDate(referenceMonth: string) {
  // referenceMonth is YYYYMM (e.g. '202602')
  // risk_score.eval_date is YYYY-MM-DD (e.g. '2026-02-01')
  // We need to compare them. Converting YYYYMM to YYYY-MM-DD (last day of month is safer for lte)
  const comparableDate = formatDate(resolveReferenceDate(referenceMonth))

  const { data } = await supabase
    .from('risk_score')
    .select('eval_date')
    .eq('eval_type', 'monthly')
    .lte('eval_date', comparableDate)
    .order('eval_date', { ascending: false })
    .limit(1)

  return data?.[0]?.eval_date as string | undefined
}

async function getAvailableMonths() {
  if (availableMonthsCache && availableMonthsCache.expiresAt >= Date.now()) {
    return availableMonthsCache.months
  }
  if (availableMonthsPending) return availableMonthsPending

  availableMonthsPending = (async () => {
    const months: string[] = []
    let cursor: string | null = null

    for (let i = 0; i < 24; i++) {
      let q = supabase
        .from('inventory')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
      if (cursor) q = q.lt('snapshot_date', cursor)

      const { data } = await q
      if (!data?.length) break

      months.push(String(data[0].snapshot_date))
      cursor = String(data[0].snapshot_date)
    }

    availableMonthsCache = {
      expiresAt: Date.now() + INVENTORY_CACHE_TTL_MS,
      months,
    }

    return months
  })()

  try {
    return await availableMonthsPending
  } finally {
    availableMonthsPending = null
  }
}

async function getMonthlyInventoryMap(snapshotDate: string) {
  const cached = monthlyInventoryMapCache.get(snapshotDate)
  if (cached && cached.expiresAt >= Date.now()) {
    return cached.invByProduct
  }
  const pending = monthlyInventoryMapPending.get(snapshotDate)
  if (pending) return pending

  const promise = (async () => {
    const rows = await fetchAll(
      'inventory',
      'product_id,inventory_qty',
      q => q.eq('snapshot_date', snapshotDate)
    )

    const invByProduct: Record<string, number> = {}
    for (const row of rows) {
      invByProduct[row.product_id] = (invByProduct[row.product_id] ?? 0) + Number(row.inventory_qty ?? 0)
    }

    monthlyInventoryMapCache.set(snapshotDate, {
      expiresAt: Date.now() + INVENTORY_CACHE_TTL_MS,
      invByProduct,
    })

    return invByProduct
  })()

  monthlyInventoryMapPending.set(snapshotDate, promise)
  try {
    return await promise
  } finally {
    monthlyInventoryMapPending.delete(snapshotDate)
  }
}

function sortProductsByInventory(products: any[], invByProduct: Record<string, number>) {
  return [...products].sort(
    (a, b) => (invByProduct[b.product_code] ?? 0) - (invByProduct[a.product_code] ?? 0)
  )
}

export async function GET(req: Request) {
  try {
    const cacheKey = getInventoryCacheKey(req)
    const cached = readInventoryCache(cacheKey)
    if (cached) return NextResponse.json(cached)

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode')
    const monthParam = searchParams.get('month')
    const typeParam = searchParams.get('type') ?? '전체'
    const search = searchParams.get('search') ?? ''
    const statusParam = (searchParams.get('status') as StatusCode | null) ?? 'all'
    const categoryParam = searchParams.get('category') ?? '전체'
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const respond = (payload: any) => {
      writeInventoryCache(cacheKey, payload)
      return NextResponse.json(payload)
    }

    const availableMonths = await getAvailableMonths()

    if (!availableMonths.length) {
      return respond({
        availableMonths: [],
        selectedMonth: null,
        trend: [],
        kpi: {},
        typeStats: {},
        categoryStats: {},
        productTypes: ['전체'],
        skuList: [],
        source: 'empty',
      })
    }

    const selectedMonth = monthParam && availableMonths.includes(monthParam)
      ? monthParam
      : availableMonths[0]

    if (mode === 'list') {
      const invByProduct = await getMonthlyInventoryMap(selectedMonth)

      const monthProductIds = Object.keys(invByProduct)
      if (!monthProductIds.length) {
        return respond({
          skuList: [],
          totalCount: 0,
          baseTotalCount: 0,
          categoryOptions: ['전체'],
          statusCounts: { all: 0, risk: 0, short: 0, normal: 0, excess: 0 },
          selectedMonth,
          source: 'database',
        })
      }

      const baseProducts = await batchIn(
        'product_master',
        'product_code,product_name,product_category,product_type',
        'product_code',
        monthProductIds,
        q => {
          let qq = q
          if (search) qq = qq.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`)
          if (typeParam !== '전체') qq = qq.eq('product_type', typeParam)
          return qq
        }
      )

      const sortedBaseProducts = sortProductsByInventory(baseProducts, invByProduct)

      const baseProductIds = sortedBaseProducts.map((p: any) => p.product_code)
      const baseTotalCount = baseProductIds.length
      const categoryOptions = ['전체', ...Array.from(new Set(
        sortedBaseProducts
          .map((p: any) => p.product_category)
          .filter(Boolean)
      )).sort()]

      if (!baseProductIds.length) {
        return respond({
          skuList: [],
          totalCount: 0,
          baseTotalCount,
          categoryOptions,
          statusCounts: { all: 0, risk: 0, short: 0, normal: 0, excess: 0 },
          selectedMonth,
          source: 'database',
        })
      }

      const latestRiskDate = await resolveMonthlyRiskDate(selectedMonth)

      const riskMap: Record<string, { safetyStock: number; grade: string }> = {}
      if (latestRiskDate) {
        const riskRows = await batchIn(
          'risk_score',
          'product_id,safety_stock,risk_grade',
          'product_id',
          baseProductIds,
          q => q.eq('eval_date', latestRiskDate).eq('eval_type', 'monthly')
        )

        for (const r of riskRows) {
          riskMap[r.product_id] = {
            safetyStock: Number(r.safety_stock ?? 0),
            grade: r.risk_grade ?? '-',
          }
        }
      }

      const baseMeta = sortedBaseProducts.map((product: any) => {
        const stock = Math.round(invByProduct[product.product_code] ?? 0)
        const safeStock = Math.round(riskMap[product.product_code]?.safetyStock ?? 0)
        const grade = riskMap[product.product_code]?.grade ?? '-'
        const statusCode = classifyInventoryStatus(stock, safeStock, grade)

        return {
          sku: product.product_code,
          name: product.product_name ?? product.product_code,
          category: product.product_category ?? '기타',
          productType: product.product_type ?? '기타',
          stock,
          safeStock,
          grade: riskMap[product.product_code]?.grade ?? '-',
          statusCode,
        }
      })

      const categoryScoped = categoryParam !== '전체'
        ? baseMeta.filter(item => item.category === categoryParam)
        : baseMeta

      const statusCounts = { all: 0, risk: 0, short: 0, normal: 0, excess: 0 }
      for (const item of categoryScoped) {
        statusCounts.all += 1
        statusCounts[item.statusCode] += 1
      }

      const filteredMeta = categoryScoped
        .filter(item => statusParam === 'all' || item.statusCode === statusParam)
        .sort((a, b) => {
          const priDiff = stockStatusPriority(a.statusCode) - stockStatusPriority(b.statusCode)
          return priDiff !== 0 ? priDiff : b.stock - a.stock
        })

      const totalCount = filteredMeta.length
      const limit = 200
      const offset = (page - 1) * limit
      const pagedMeta = filteredMeta.slice(offset, offset + limit)
      const productIds = pagedMeta.map(item => item.sku)

      if (!productIds.length) {
        return respond({
          skuList: [],
          totalCount,
          baseTotalCount,
          categoryOptions,
          statusCounts,
          selectedMonth,
          source: 'database',
        })
      }

      const referenceDate = resolveReferenceDate(selectedMonth)
      const eightWeeksAgo = new Date(referenceDate)
      eightWeeksAgo.setDate(referenceDate.getDate() - 56)

      const sixMonthsAgo = new Date(referenceDate)
      sixMonthsAgo.setMonth(referenceDate.getMonth() - 6)

      const fourWeeksAgo = new Date(referenceDate)
      fourWeeksAgo.setDate(referenceDate.getDate() - 28)

      const wkPromise = batchIn(
        'weekly_product_summary',
        'product_id,order_qty',
        'product_id',
        productIds,
        q => q.gte('week_start', formatDate(eightWeeksAgo)).lte('week_start', formatDate(referenceDate))
      )

      const poPromise = batchIn(
        'purchase_order',
        'component_product_id,unit_price',
        'component_product_id',
        productIds,
        q => q.gte('po_date', formatDate(sixMonthsAgo)).lte('po_date', formatDate(referenceDate)).not('unit_price', 'is', null)
      )

      const custPromise = batchIn(
        'weekly_customer_summary',
        'product_id,customer_id,order_qty',
        'product_id',
        productIds,
        q => q.gte('week_start', formatDate(fourWeeksAgo)).lte('week_start', formatDate(referenceDate))
      )

      const [wkRows, poRows, custRows] = await Promise.all([
        wkPromise,
        poPromise,
        custPromise,
      ])

      const demandAcc: Record<string, { total: number; cnt: number }> = {}
      for (const r of wkRows) {
        if (!demandAcc[r.product_id]) demandAcc[r.product_id] = { total: 0, cnt: 0 }
        demandAcc[r.product_id].total += Number(r.order_qty ?? 0)
        demandAcc[r.product_id].cnt++
      }

      const costAcc: Record<string, { total: number; cnt: number }> = {}
      for (const r of poRows) {
        if (!costAcc[r.component_product_id]) costAcc[r.component_product_id] = { total: 0, cnt: 0 }
        costAcc[r.component_product_id].total += Number(r.unit_price ?? 0)
        costAcc[r.component_product_id].cnt++
      }

      const custAcc: Record<string, Record<string, number>> = {}
      for (const r of custRows) {
        if (!custAcc[r.product_id]) custAcc[r.product_id] = {}
        custAcc[r.product_id][r.customer_id] = (custAcc[r.product_id][r.customer_id] ?? 0) + Number(r.order_qty ?? 0)
      }

      const custMap: Record<string, string> = {}
      for (const [pid, cmap] of Object.entries(custAcc)) {
        const top = Object.entries(cmap).sort(([, a], [, b]) => b - a)[0]
        if (top) custMap[pid] = top[0]
      }

      const metaMap: Record<string, any> = {}
      for (const item of pagedMeta) metaMap[item.sku] = item

      const skuList = productIds.map(pid => ({
        sku: pid,
        name: metaMap[pid]?.name ?? pid,
        category: metaMap[pid]?.category ?? '기타',
        productType: metaMap[pid]?.productType ?? '기타',
        stock: metaMap[pid]?.stock ?? 0,
        safeStock: metaMap[pid]?.safeStock ?? 0,
        unitCost: costAcc[pid] ? Math.round(costAcc[pid].total / costAcc[pid].cnt) : 0,
        weeklyDemand: demandAcc[pid] ? Math.round(demandAcc[pid].total / demandAcc[pid].cnt) : 0,
        customer: custMap[pid] ?? '-',
        grade: metaMap[pid]?.grade ?? '-',
      }))

      return respond({
        skuList,
        totalCount,
        baseTotalCount,
        categoryOptions,
        statusCounts,
        selectedMonth,
        source: 'database',
      })
    }

    const selectedMonthIndex = Math.max(0, availableMonths.indexOf(selectedMonth))
    const trendMonths = availableMonths.slice(selectedMonthIndex, selectedMonthIndex + 12).reverse()
    const [invByProduct, trendInventoryMaps] = await Promise.all([
      getMonthlyInventoryMap(selectedMonth),
      Promise.all(trendMonths.map(month => getMonthlyInventoryMap(month))),
    ])

    const selectedMonthIds = Object.keys(invByProduct)
    const allProductIds = Array.from(new Set(
      trendInventoryMaps.flatMap(invMap => Object.keys(invMap))
    ))

    const productsPromise = batchIn(
      'product_master',
      'product_code,product_type,product_category,product_name',
      'product_code',
      allProductIds
    )

    const riskPromise = resolveMonthlyRiskDate(selectedMonth)
      .then(async (latestRiskDate) => {
        const safetyMap: Record<string, { safetyStock: number; grade: string }> = {}
        
        if (latestRiskDate && selectedMonthIds.length > 0) {
          const riskRows = await batchIn(
            'risk_score',
            'product_id,safety_stock,risk_grade',
            'product_id',
            selectedMonthIds,
            q => q.eq('eval_date', latestRiskDate).eq('eval_type', 'monthly')
          )
          
          for (const r of riskRows) {
            safetyMap[r.product_id] = {
              safetyStock: Number(r.safety_stock ?? 0),
              grade: r.risk_grade ?? '-'
            }
          }
        }
        
        return safetyMap
      })

    const [allProducts, safetyMap] = await Promise.all([productsPromise, riskPromise])

    const productMap: Record<string, any> = {}
    for (const p of allProducts) productMap[p.product_code] = p

    const trendMap: Record<string, Record<string, number>> = {}
    trendMonths.forEach((month, index) => {
      const monthInventory = trendInventoryMaps[index] ?? {}
      if (!trendMap[month]) trendMap[month] = {}

      for (const [pid, qty] of Object.entries(monthInventory)) {
        const productType = productMap[pid]?.product_type ?? '기타'
        trendMap[month][productType] = (trendMap[month][productType] ?? 0) + Number(qty ?? 0)
      }
    })

    const trend = trendMonths.map(month => ({
      month,
      label: monthLabel(month),
      ...(trendMap[month] ?? {}),
    }))

    const typeSet = new Set<string>()
    for (const pid of selectedMonthIds) {
      const productType = productMap[pid]?.product_type
      if (productType) typeSet.add(productType)
    }
    const productTypes = ['전체', ...Array.from(typeSet).sort()]

    const typeStats: Record<string, { qty: number; skuCount: number; riskCount: number; shortCount: number }> = {}
    const categoryStats: Record<string, number> = {}
    let totalQty = 0
    let totalRisk = 0
    let totalShort = 0

    for (const [pid, qty] of Object.entries(invByProduct)) {
      const productType = productMap[pid]?.product_type ?? '기타'
      const productCategory = productMap[pid]?.product_category ?? '기타'
      if (!typeStats[productType]) {
        typeStats[productType] = { qty: 0, skuCount: 0, riskCount: 0, shortCount: 0 }
      }

      typeStats[productType].qty += qty
      typeStats[productType].skuCount++
      totalQty += qty

      if (typeParam !== '전체' && productType === typeParam) {
        categoryStats[productCategory] = (categoryStats[productCategory] ?? 0) + qty
      }

      const riskInfo = safetyMap[pid]
      const safeStock = riskInfo?.safetyStock ?? 0
      const grade = riskInfo?.grade ?? '-'

      const statusCode = classifyInventoryStatus(Number(qty ?? 0), safeStock, grade)

      if (statusCode === 'risk') {
        typeStats[productType].riskCount++
        totalRisk++
      } else if (statusCode === 'short') {
        typeStats[productType].shortCount++
        totalShort++
      }
    }

    typeStats['전체'] = {
      qty: totalQty,
      skuCount: selectedMonthIds.length,
      riskCount: totalRisk,
      shortCount: totalShort,
    }

    const referenceDate = resolveReferenceDate(selectedMonth)
    const eightWeeksAgo = new Date(referenceDate)
    eightWeeksAgo.setDate(referenceDate.getDate() - 56)

    const filteredIds = typeParam !== '전체'
      ? selectedMonthIds.filter(pid => productMap[pid]?.product_type === typeParam)
      : selectedMonthIds

    let avgCoverageDays = 0
    if (filteredIds.length > 0) {
      const wkRows = await batchIn(
        'weekly_product_summary',
        'product_id,order_qty',
        'product_id',
        filteredIds,
        q => q.gte('week_start', formatDate(eightWeeksAgo)).lte('week_start', formatDate(referenceDate))
      )

      const demandByPid: Record<string, { total: number; cnt: number }> = {}
      for (const r of wkRows) {
        if (!demandByPid[r.product_id]) demandByPid[r.product_id] = { total: 0, cnt: 0 }
        demandByPid[r.product_id].total += Number(r.order_qty ?? 0)
        demandByPid[r.product_id].cnt++
      }

      const typeInventory = filteredIds.reduce((sum, pid) => sum + (invByProduct[pid] ?? 0), 0)
      const weeklyDemand = Object.values(demandByPid)
        .reduce((sum, { total, cnt }) => sum + (cnt > 0 ? total / cnt : 0), 0)

      avgCoverageDays = weeklyDemand > 0 ? Math.round((typeInventory / weeklyDemand) * 7) : 0
    }

    const selectedTypeStats = typeStats[typeParam] ?? typeStats['전체']
    const kpi = {
      totalSku: selectedTypeStats.skuCount,
      totalQty: Math.round(selectedTypeStats.qty),
      riskCount: selectedTypeStats.riskCount,
      shortCount: selectedTypeStats.shortCount,
      avgCoverageDays,
      snapshotDate: selectedMonth,
    }

    return respond({
      availableMonths,
      selectedMonth,
      productTypes,
      kpi,
      trend,
      typeStats,
      categoryStats,
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] inventory error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
