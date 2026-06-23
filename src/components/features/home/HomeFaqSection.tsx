'use client'

import type { ReactNode } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { FaqAccordion } from '@/components/common/FaqAccordion'
import type { FaqItem } from '@/components/common/FaqAccordion'
import AppInstallFaqAnswer from '@/components/features/home/AppInstallFaqAnswer'

// 단일 소스 — 표시 항목(FaqAccordion)과 JSON-LD(FAQPage)를 같은 질문/답변으로 생성한다.
//   a: schema(JSON-LD text)용 string. display: 표시용 ReactNode(있으면 표시는 display, schema는 항상 a).
const HOME_FAQ: { q: string; a: string; display?: ReactNode }[] = [
  {
    q: '우나어가 뭐예요?',
    a: '50·60대를 위한 온라인 커뮤니티예요. 일상 이야기, 인생 2막 준비, 웃음방, 내일찾기(일자리), 건강·재테크 매거진까지 — 우리 또래 이야기가 다 모여 있어요.',
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '안드로이드(삼성 등)는 구글 플레이스토어에서 우나어 앱을 받을 수 있어요. 아이폰은 사파리에서 “홈 화면에 추가”로 앱처럼 쓸 수 있어요.',
    display: <AppInstallFaqAnswer />,
  },
  {
    q: '가입비가 있나요?',
    a: '완전 무료예요. 가입비도, 월정액도 없습니다. 카카오 계정만 있으면 모든 기능을 제한 없이 쓸 수 있어요.',
  },
  {
    q: '어떤 이야기를 나눌 수 있나요?',
    a: '사는이야기(일상 공감), 2막준비(재취업·창업·은퇴), 웃음방(우리 또래 유머), 내일찾기(일자리 정보), 매거진(건강·재테크·여행 정보) — 우리 나이에 필요한 이야기를 나눌 수 있어요.',
  },
  {
    q: '내 정보가 공개되나요?',
    a: '닉네임으로만 활동해요. 실명이나 연락처는 다른 회원에게 공개되지 않습니다.',
  },
]

const HOME_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOME_FAQ.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.a,
    },
  })),
}

export default function HomeFaqSection() {
  const { status } = useAppSession()
  const { isCapacitor } = useAppEnvironment()
  if (status === 'loading' || status === 'authenticated') return null

  // 앱(Capacitor)에서는 "앱을 설치해야 하나요?"(display=AppInstallFaqAnswer) 항목 제외 — 이미 앱 사용자
  // schema(JSON-LD)는 전체 유지(웹 SEO용, 앱 WebView는 크롤러 아님)
  const items: FaqItem[] = (isCapacitor ? HOME_FAQ.filter((f) => !f.display) : HOME_FAQ)
    .map((f) => ({ q: f.q, a: f.display ?? f.a }))

  return (
    <section className="px-4 py-4 lg:px-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_FAQ_SCHEMA) }}
      />
      <h2 className="text-title font-bold text-foreground mb-4">자주 묻는 질문</h2>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <FaqAccordion key={item.q} item={item} />
        ))}
      </div>
    </section>
  )
}
