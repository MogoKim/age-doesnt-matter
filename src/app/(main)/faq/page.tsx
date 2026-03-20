'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

interface FaqItem {
  q: string
  a: ReactNode
}

const faqs: FaqItem[] = [
  {
    q: '우리 나이가 어때서는 어떤 서비스인가요?',
    a: '5060 세대를 위한 커뮤니티 플랫폼입니다. 자유로운 소통, 일자리 정보, 건강·생활 매거진 등을 제공합니다.',
  },
  {
    q: '가입은 어떻게 하나요?',
    a: '카카오 계정으로 간편하게 가입할 수 있습니다. [카카오로 시작하기] 버튼을 눌러주세요. 별도의 회원가입 절차 없이 바로 이용 가능합니다.',
  },
  {
    q: '닉네임은 변경할 수 있나요?',
    a: '네, 마이페이지 > 설정에서 변경할 수 있습니다. 단, 닉네임 변경은 30일에 1회만 가능합니다.',
  },
  {
    q: '등급은 어떻게 올라가나요?',
    a: (
      <div className="space-y-1">
        <p>활동에 따라 자동으로 등급이 올라갑니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>🌱 새싹 — 가입 시 기본 등급</li>
          <li>🌿 단골 — 게시글 5개 + 댓글 10개 이상</li>
          <li>🌳 토박이 — 게시글 20개 + 댓글 50개 이상</li>
          <li>👑 어르신 — 게시글 50개 + 댓글 100개 + 좋아요 200개 이상</li>
        </ul>
      </div>
    ),
  },
  {
    q: '글을 쓰려면 어떤 등급이 필요한가요?',
    a: '🌱새싹 등급부터 글쓰기가 가능합니다. 이미지와 유튜브 링크 첨부는 🌿단골 등급부터 가능합니다.',
  },
  {
    q: '부적절한 글이나 댓글은 어떻게 신고하나요?',
    a: '글 또는 댓글의 [신고] 버튼을 누르면 신고 사유를 선택할 수 있습니다. 신고가 3건 이상 접수되면 자동으로 숨김 처리되며, 운영진이 검토합니다.',
  },
  {
    q: '특정 사용자를 차단할 수 있나요?',
    a: '네, 해당 사용자의 프로필에서 [차단] 버튼을 누르면 됩니다. 차단한 사용자의 글과 댓글은 더 이상 보이지 않습니다. 마이페이지 > 설정 > 차단 관리에서 해제할 수 있습니다.',
  },
  {
    q: '일자리 정보는 어디서 보나요?',
    a: '상단 메뉴의 [일자리] 탭에서 지역, 급여, 근무시간 등 조건별로 일자리를 찾을 수 있습니다.',
  },
  {
    q: '탈퇴하고 싶어요.',
    a: '마이페이지 > 설정 > 회원 탈퇴에서 탈퇴할 수 있습니다. 탈퇴 후 30일간 데이터가 보관된 후 완전히 삭제됩니다. 같은 카카오 계정으로 30일 이내 재가입하면 데이터가 복구됩니다.',
  },
  {
    q: '글자 크기를 바꿀 수 있나요?',
    a: '네, 마이페이지 > 설정 > 글자 크기에서 작게/보통/크게 중 선택할 수 있습니다.',
  },
]

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-card hover:bg-accent/50 transition-colors min-h-[52px] cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="text-base font-bold text-foreground pr-4">{item.q}</span>
        <span className="text-xl text-muted-foreground shrink-0 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-card border-t border-border text-base text-foreground leading-[1.85]">
          {item.a}
        </div>
      )}
    </div>
  )
}

export default function FaqPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-2">자주 묻는 질문</h1>
      <p className="text-base text-muted-foreground mb-8">궁금한 점이 있으시면 아래에서 찾아보세요.</p>

      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <FaqAccordion key={i} item={faq} />
        ))}
      </div>

      <div className="mt-8 p-6 bg-primary/5 rounded-2xl text-center">
        <p className="text-base text-foreground mb-2">찾으시는 답변이 없으신가요?</p>
        <a
          href="/contact"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-white rounded-full font-bold text-base no-underline min-h-[52px] hover:bg-primary/90 transition-colors"
        >
          문의하기
        </a>
      </div>
    </div>
  )
}
