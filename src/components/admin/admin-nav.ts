export interface NavItem {
  label: string
  icon: string
  href: string
}

export const adminNavItems: NavItem[] = [
  { label: '대시보드', icon: '📊', href: '/admin' },
  { label: '참여 이벤트', icon: '🗳', href: '/admin/vote-events' },
  { label: '웹 A/B', icon: '🧪', href: '/admin/ab-tests' },
  { label: '회원 관리', icon: '👥', href: '/admin/members' },
  { label: '콘텐츠 관리', icon: '📝', href: '/admin/content' },
  { label: '푸시 관리', icon: '🔔', href: '/admin/push' },
  { label: '배너 관리', icon: '🖼️', href: '/admin/banners' },
  { label: '팝업 관리', icon: '📢', href: '/admin/popups' },
  { label: '승인 대기', icon: '🔔', href: '/admin/queue' },
  { label: '신고 관리', icon: '🛡️', href: '/admin/reports' },
  { label: '욕망 지도', icon: '🧠', href: '/admin/daily-brief' },
  { label: '에이전트 로그', icon: '🤖', href: '/admin/agents' },
  { label: '감사 로그', icon: '📋', href: '/admin/audit-log' },
  { label: '설정', icon: '⚙️', href: '/admin/settings' },
]

export const adminPageTitles: Record<string, string> = {
  '/admin': '대시보드',
  '/admin/vote-events': '참여 이벤트 — 오늘의 투표',
  '/admin/ab-tests': '웹 A/B 테스트',
  '/admin/members': '회원 관리',
  '/admin/content': '콘텐츠 관리',
  '/admin/push': '푸시 관리',
  '/admin/banners': '배너 관리',
  '/admin/popups': '팝업 관리',
  '/admin/queue': '승인 대기',
  '/admin/reports': '신고 관리',
  '/admin/daily-brief': '욕망 지도',
  '/admin/agents': '에이전트 로그',
  '/admin/audit-log': '감사 로그',
  '/admin/settings': '설정',
}
