'use client'

import React, { useEffect, useState } from 'react'
import { T } from '@/lib/data'
import { GradeBadge, RiskTypeBadge, StatusBadge } from '@/components/ui'

// 리스크 보고서용 타입 (RiskManagement와 형태 공유)
type RiskItem = {
  id: number; sku: string; name: string; score: number; grade: string;
  type: string; action: string; status: string;
  stock: number; safeStock: number; leadTime: number; customer: string;
}

export default function RiskReportPage() {
  const [items, setItems] = useState<RiskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [params, setParams] = useState({ date: '', type: '전체' })

  useEffect(() => {
    // URL에서 쿼리 파라미터 가져오기 (useSearchParams를 쓰면 Suspense 바운더리 요구되므로 원시 URL파싱 씀)
    const p = new URLSearchParams(window.location.search)
    const date = p.get('date') || ''
    const type = p.get('type') || '전체'
    setParams({ date, type })

    fetch(`/api/risk?date=${date}&type=${type}`)
      .then(res => res.json())
      .then(data => {
        if (data.source === 'database' || data.source === 'empty') {
          setItems(data.items || [])
          setParams(prev => ({ ...prev, date: data.evalDate || prev.date }))
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: T.text3 }}>브리핑 보고서를 생성 중입니다...</div>
  if (error) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: T.red }}>데이터를 불러올 수 없습니다.</div>

  // 통계 계산
  const gradeCounts = { A:0, B:0, C:0, D:0, E:0, F:0 }
  items.forEach(r => {
    if ((gradeCounts as any)[r.grade] !== undefined) (gradeCounts as any)[r.grade]++
  })

  // 악성 등급(E, F) 아이템들 (최대 10개만 리포트에 구체적으로 표기)
  const badItems = items.filter(r => ['E', 'F'].includes(r.grade)).slice(0, 10)

  // A4 사이즈 및 인쇄 전용 CSS
  return (
    <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '20px 0', fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
          .print-container { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}} />

      {/* A4 용지 컨테이너 (정확한 mm 단위는 210x297이나, 화면 비율상 아래 px이 적절) */}
      <div className="print-container" style={{
         width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff',
         padding: '20mm', boxSizing: 'border-box', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
         border: '1px solid #ccc', color: '#1e293b'
      }}>
        
        {/* 브리핑 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #1e293b', paddingBottom: 16, marginBottom: 24 }}>
          <div>
             <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>리스크 종합 브리핑</h1>
             <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>ForecastAI Risk Monitoring Report</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
             <div><strong>출력일시:</strong> {new Date().toLocaleString()}</div>
             <div><strong>기준일자:</strong> {params.date || '최신'}</div>
             <div><strong>분류기준:</strong> {params.type}</div>
             <button className="no-print" onClick={() => window.print()} style={{
               marginTop: 12, background: '#2563eb', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600
             }}>보고서 인쇄/PDF 저장</button>
          </div>
        </div>

        {/* 1. 요약 정보 */}
        <h2 style={{ fontSize: 18, color: '#0f172a', borderLeft: '4px solid #3b82f6', paddingLeft: 10, marginTop: 32, marginBottom: 16 }}>1. 위험 등급 현황 종합</h2>
        
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>조회된 총 품목(표본)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{items.length}</div>
          </div>
          <div style={{ flex: 1, background: '#fef2f2', padding: '20px', borderRadius: 8, border: '1px solid #fecaca', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#dc2626', marginBottom: 4 }}>요주의 품목 (E,F 등급)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{badItems.length}</div>
          </div>
        </div>

        {/* 등급 요약 표 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 40 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '10px', textAlign: 'center' }}>등급 (Grade)</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>A</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>B</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>C</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>D</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#dc2626' }}>E</th>
              <th style={{ padding: '10px', textAlign: 'center', color: '#7c3aed' }}>F</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600 }}>해당 품목 수</td>
              <td style={{ padding: '12px 10px', textAlign: 'center' }}>{gradeCounts.A}</td>
              <td style={{ padding: '12px 10px', textAlign: 'center' }}>{gradeCounts.B}</td>
              <td style={{ padding: '12px 10px', textAlign: 'center' }}>{gradeCounts.C}</td>
              <td style={{ padding: '12px 10px', textAlign: 'center' }}>{gradeCounts.D}</td>
              <td style={{ padding: '12px 10px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{gradeCounts.E}</td>
              <td style={{ padding: '12px 10px', textAlign: 'center', color: '#7c3aed', fontWeight: 700 }}>{gradeCounts.F}</td>
            </tr>
          </tbody>
        </table>

        {/* 2. 핵심 리스크 품목 상세 */}
        <h2 style={{ fontSize: 18, color: '#0f172a', borderLeft: '4px solid #ef4444', paddingLeft: 10, marginTop: 32, marginBottom: 16 }}>2. 요주의 품목 (E, F 등급) 조치 브리핑</h2>
        
        {badItems.length === 0 ? (
          <div style={{ padding: 20, background: '#f8fafc', borderRadius: 8, color: '#64748b', fontSize: 14 }}>
            현재 E, F 등급에 해당하는 위험 품목이 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: '25%' }}>SKU / 품목명</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>리스크</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>재고/안전 (비율)</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: '30%' }}>권고 액션</th>
              </tr>
            </thead>
            <tbody>
              {badItems.map(r => {
                const ratio = r.safeStock > 0 ? Math.round((r.stock / r.safeStock) * 100) : 0
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 8px' }}>
                       <div style={{ fontFamily: "monospace", color: '#64748b', fontSize: 10 }}>{r.sku}</div>
                       <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.name}</div>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                       <span style={{ fontWeight: 800, color: r.grade === 'F' ? '#7c3aed' : '#dc2626', marginRight: 6 }}>{r.grade}</span>
                       ({r.type})
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                       <div style={{ color: r.stock < r.safeStock ? '#dc2626' : '#0f172a' }}>{r.stock.toLocaleString()} / {r.safeStock.toLocaleString()}</div>
                       <div style={{ fontSize: 10, color: '#94a3b8' }}>{ratio}%</div>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#1d4ed8', fontWeight: 500, lineHeight: 1.4 }}>
                       {r.action}
                       {r.leadTime > 0 && <div style={{ fontSize: 10, color: '#64748b', fontWeight: 400, marginTop: 4 }}>*리드타임: {r.leadTime}일</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        
        {items.length > 0 && badItems.length === 10 && (
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 8 }}>
            * 지면 관계상 위험도 최상위 10건만 출력되었습니다.
          </div>
        )}

        <div style={{ marginTop: '50mm', textAlign: 'center', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          ForecastAI System Generated Report &copy; {new Date().getFullYear()}
        </div>

      </div>
    </div>
  )
}
