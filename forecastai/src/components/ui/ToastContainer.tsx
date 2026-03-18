'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { T } from '@/lib/data'

/* ──────── 토스트 항목 타입 ──────── */
export interface ToastItem {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  message?: string | null
  target_page?: string | null
}

/* ──────── 스타일 매핑 ──────── */
const SEVERITY_STYLE: Record<string, { bg: string; border: string; accent: string; icon: string; label: string }> = {
  critical: { bg: '#1C1012', border: '#7F1D1D', accent: T.red,    icon: '!!',  label: '긴급' },
  high:     { bg: '#1A1308', border: '#78350F', accent: T.orange, icon: '!',  label: '높음' },
  medium:   { bg: '#1A1708', border: '#713F12', accent: T.amber,  icon: 'i', label: '보통' },
  low:      { bg: '#0A1A14', border: '#064E3B', accent: T.green,  icon: 'i',  label: '낮음' },
}

/* ──────── 개별 토스트 ──────── */
function Toast({ item, onDismiss, onNavigate }: {
  item: ToastItem
  onDismiss: (id: string) => void
  onNavigate?: (page: string) => void
}) {
  const s = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.medium
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 등장 애니메이션
    requestAnimationFrame(() => setVisible(true))
    // 자동 사라짐 (critical: 10초, 나머지: 6초)
    const duration = item.severity === 'critical' ? 10000 : 6000
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(item.id), 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [item.id, item.severity, onDismiss])

  return (
    <div
      onClick={() => {
        if (item.target_page && onNavigate) onNavigate(item.target_page)
        onDismiss(item.id)
      }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px', minWidth: 320, maxWidth: 400,
        background: s.bg, border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.accent}`,
        borderRadius: 10, cursor: item.target_page ? 'pointer' : 'default',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(60px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      {/* 아이콘 */}
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
        background: s.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#fff',
      }}>
        {s.icon}
      </div>

      {/* 내용 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: s.accent, textTransform: 'uppercase' }}>{s.label}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', lineHeight: 1.4 }}>{item.title}</div>
        {item.message && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3, lineHeight: 1.3 }}>{item.message}</div>
        )}
      </div>

      {/* 닫기 */}
      <button
        onClick={(e) => { e.stopPropagation(); setVisible(false); setTimeout(() => onDismiss(item.id), 300) }}
        style={{
          background: 'none', border: 'none', color: '#64748B', cursor: 'pointer',
          fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0,
        }}
      >
        x
      </button>
    </div>
  )
}

/* ──────── 토스트 컨테이너 ──────── */
export function ToastContainer({ toasts, onDismiss, onNavigate }: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
  onNavigate?: (page: string) => void
}) {
  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', top: 70, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'auto',
    }}>
      {toasts.slice(0, 5).map(t => (
        <Toast key={t.id} item={t} onDismiss={onDismiss} onNavigate={onNavigate} />
      ))}
    </div>
  )
}
