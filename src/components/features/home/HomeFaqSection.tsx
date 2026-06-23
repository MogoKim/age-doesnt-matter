'use client'

import { useAppSession } from '@/components/common/AppSessionProvider'
import { FaqAccordion } from '@/components/common/FaqAccordion'
import type { FaqItem } from '@/components/common/FaqAccordion'

// 단일 소스 — 표시 항목(FaqAccordion)과 JSON-LD(FAQPage)를 같은 질문/답변으로 생성한다.
const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: '우나어가 뭐예요?',
    a: '50·60대를 위한 온라인 커뮤니티예요. 일상 이야기, 인생 2막 준비, 웃음방, 내일찾기(일자리), 건강·재테크 매거진까지 — 우리 또래 이야기가 다 모여 있어요.',
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '꼭 설치하지 않아도 돼요. 안드로이드 폰은 구글 플레이스토어에서 앱으로 설치할 수 있어요. 아이폰은 별도 앱 대신 사파리(Safari)에서 “홈 화면에 추가”를 누르면 앱처럼 쓸 수 있어요. PC는 웹 브라우저에서 주소로 바로 이용하면 됩니다.',
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

const HOME_FAQ_ITEMS: FaqItem[] = HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))

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
  if (status === 'loading' || status === 'authenticated') return null

  return (
    <section className="px-4 py-6 lg:px-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_FAQ_SCHEMA) }}
      />
      <h2 className="text-title font-bold text-foreground mb-4">자주 묻는 질문</h2>
      <div className="flex flex-col gap-3">
        {HOME_FAQ_ITEMS.map((item) => (
          <FaqAccordion key={item.q} item={item} />
        ))}
      </div>
    </section>
  )
}
