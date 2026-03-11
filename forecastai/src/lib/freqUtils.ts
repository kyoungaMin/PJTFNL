export type Freq = 'day' | 'week' | 'month'

export function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function dayLabel(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10)
  const day = parseInt(dateStr.slice(8, 10), 10)
  return `${m}/${day}`
}

export function weekLabel(mondayStr: string): string {
  const m = parseInt(mondayStr.slice(5, 7), 10)
  const day = parseInt(mondayStr.slice(8, 10), 10)
  return `${m}/${day}~`
}

export function ymLabel(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10)
  return `${m}월`
}

export function labelFor(key: string, freq: Freq): string {
  if (freq === 'day') return dayLabel(key)
  if (freq === 'week') return weekLabel(key)
  return ymLabel(key.length > 7 ? key.slice(0, 7) : key)
}

export function groupRowsByFreq(
  rows: { date: string; indicator_code: string; value: number }[],
  freq: Freq
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const dateStr = row.date.slice(0, 10)
    let key: string
    if (freq === 'day') key = dateStr
    else if (freq === 'week') key = getWeekMonday(dateStr)
    else key = dateStr.slice(0, 7)
    if (!map[key]) map[key] = {}
    map[key][row.indicator_code] = Number(row.value)
  }
  return map
}

// exchange_rate 테이블용: { rate_date, base_currency, rate }
export function groupFxRowsByFreq(
  rows: { rate_date: string; base_currency: string; rate: number }[],
  freq: Freq
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const dateStr = (row.rate_date as string).slice(0, 10)
    let key: string
    if (freq === 'day') key = dateStr
    else if (freq === 'week') key = getWeekMonday(dateStr)
    else key = dateStr.slice(0, 7)
    if (!map[key]) map[key] = {}
    map[key][row.base_currency] = Number(row.rate)
  }
  return map
}

// 비정기 데이터를 period keys에 forward-fill
export function forwardFillToKeys(
  periodKeys: string[],
  rateRows: { date: string; indicator_code: string; value: number }[],
  codes: string[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  const lastVal: Record<string, number> = {}
  const sorted = [...rateRows].sort((a, b) => a.date.localeCompare(b.date))
  let ri = 0
  for (const pk of periodKeys) {
    const pkEnd = pk.length === 7 ? pk + '-31' : pk
    while (ri < sorted.length && sorted[ri].date.slice(0, 10) <= pkEnd) {
      lastVal[sorted[ri].indicator_code] = Number(sorted[ri].value)
      ri++
    }
    result[pk] = {}
    for (const code of codes) result[pk][code] = lastVal[code] ?? 0
  }
  return result
}

// period별 기본 기간(months) 설정
export function defaultMonthsForFreq(freq: Freq): number {
  if (freq === 'day') return 3
  if (freq === 'week') return 6
  return 12
}

// period options 반환
export function periodOptionsForFreq(freq: Freq): readonly number[] {
  if (freq === 'day') return [1, 3, 6] as const
  if (freq === 'week') return [1, 3, 6, 12] as const
  return [3, 6, 12, 24] as const
}
