export interface NavItem {
  label: string
  icon: string
  href: string
}

export const adminNavItems: NavItem[] = [
  { label: '대시보드', icon: '📊', href: '/admin' },
  { label: '승인 대기', icon: '🔔', href: '/admin/queue' },
  { label: '욕망 지도', icon: '🧠', href: '/admin/daily-brief' },
  { label: '에이전트 로그', icon: '🤖', href: '/admin/agents' },
  { label: '콘텐츠 관리', icon: '📝', href: '/admin/content' },
  { label: '회원 관리', icon: '👥', href: '/admin/members' },
  { label: '신고 관리', icon: '🛡️', href: '/admin/reports' },
  { label: '배너 관리', icon: '🖼️', href: '/admin/banners' },
  { label: '팝업 관리', icon: '📢', href: '/admin/popups' },
  { label: '데이터 분석', icon: '📈', href: '/admin/analytics' },
  { label: '감사 로그', icon: '📋', href: '/admin/audit-log' },
  { label: '설정', icon: '⚙️', href: '/admin/settings' },
]

export const adminPageTitles: Record<string, string> = {
  '/admin': '대시보드',
  '/admin/queue': '승인 대기',
  '/admin/daily-brief': '욕망 지도',
  '/admin/agents': '에이전트 로그',
  '/admin/content': '콘텐츠 관리',
  '/admin/members': '회원 관리',
  '/admin/reports': '신고 관리',
  '/admin/banners': '배너 관리',
  '/admin/popups': '팝업 관리',
  '/admin/analytics': '데이터 분석',
  '/admin/audit-log': '감사 로그',
  '/admin/settings': '설정',
}
