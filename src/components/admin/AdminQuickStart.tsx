'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'admin-quickstart-dismissed'

const guides = [
  { icon: '📊', label: '대시보드', href: '/admin', desc: '오늘의 핵심 수치와 봇 상태를 한눈에 확인합니다.' },
  { icon: '📝', label: '콘텐츠 관리', href: '/admin/content', desc: '게시글 검색, 숨김/삭제/핀 고정 처리를 합니다.' },
  { icon: '👥', label: '회원 관리', href: '/admin/members', desc: '회원 등급 변경, 정지/차단 제재를 합니다.' },
  { icon: '🛡️', label: '신고 관리', href: '/admin/reports', desc: '신고 접수건을 검토 후 숨김/삭제/기각 처리합니다.' },
  { icon: '🖼️', label: '배너 관리', href: '/admin/banners', desc: '히어로 배너 + 광고 배너를 등록/관리합니다.' },
  { icon: '📢', label: '팝업 관리', href: '/admin/popups', desc: '팝업 생성/수정/삭제, 대상 페이지별 노출을 설정합니다.' },
  { icon: '📈', label: '데이터 분석', href: '/admin/analytics', desc: 'DAU/WAU/MAU 등 핵심 지표를 확인합니다.' },
  { icon: '⚙️', label: '설정', href: '/admin/settings', desc: '게시판 설정, 금지어, 자동 승격 기준을 조정합니다.' },
]

export default function AdminQuickStart() {
  const [dismissed, setDismissed] = useState(true) // default hidden to prevent flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true')
  }, [])

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-blue-900">어드민 가이드</h2>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
        >
          다시 보지 않기
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {guides.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="flex gap-3 rounded-lg bg-white p-3 no-underline border border-blue-100 transition-colors hover:border-blue-300 hover:shadow-sm"
          >
            <span className="text-xl">{g.icon}</span>
            <div>
              <p className="text-sm font-medium text-zinc-900">{g.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{g.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
