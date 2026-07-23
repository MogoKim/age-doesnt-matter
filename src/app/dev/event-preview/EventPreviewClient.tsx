'use client'

import HeroSliderClient, { type SlideData } from '@/components/features/home/HeroSliderClient'

/**
 * 계층 B 프리뷰 — 세 타입 HERO 슬라이드를 실제 렌더러(HeroSliderClient)로 렌더.
 * 각 fixture의 상위 SlideData.subtitle에 일부러 **긴 설명(LONG_DESC)**을 넣어,
 * SURVEY 입구(SurveyHeroSlide)가 그것을 무시하고 짧은 문구만 노출하는지(=긴 설명 미노출) 검증한다.
 */
const LONG_DESC =
  '이 긴 설명은 설문 상세 화면에서만 보여야 하고 HERO 입구에는 절대로 노출되면 안 되는 아주 긴 안내 문장입니다. 개인정보나 민감한 내용은 적지 말아 주세요.'

const VOTE_SLIDE: SlideData = {
  id: 'qa-vote',
  title: '오늘의 투표 (QA)',
  themeColor: '#FF6F61',
  themeColorMid: '#FF8A7A',
  themeColorEnd: '#FFB3A6',
  ctaUrl: '/events/qa-vote',
  vote: {
    id: 'qa-vote',
    question: '점심 뭐 드실래요? (QA)',
    optionA: '짜장',
    optionB: '짬뽕',
    status: 'OPEN',
    linkedPostUrl: '/community/stories',
  },
}

// FEEDBACK = vote/survey 없는 일반 배너 슬라이드 (기존 동작 회귀 확인용)
const FEEDBACK_SLIDE: SlideData = {
  id: 'qa-feedback',
  title: '의견을 들려주세요 (QA)',
  subtitle: '여러분의 의견을 기다립니다',
  themeColor: '#5B4B8A',
  themeColorMid: '#7C6BB0',
  themeColorEnd: '#A99BD6',
  ctaText: '의견 남기러 가기',
  ctaUrl: '/events/qa-feedback',
}

const SURVEY_SLIDE: SlideData = {
  id: 'qa-survey',
  // 상위 subtitle에 긴 설명을 넣어도 SurveyHeroSlide는 이를 쓰지 않아야 함(미노출 검증)
  title: '설문 제목 (QA)',
  subtitle: LONG_DESC,
  themeColor: '#3730A3',
  themeColorMid: '#4F46E5',
  themeColorEnd: '#818CF8',
  ctaUrl: '/events/qa-survey?src=hero',
  survey: {
    label: '1분 의견함',
    title: '우나어, 어떤 점이 더 좋아지면 좋을까요? 이 제목은 일부러 길게 써서 두 줄 넘김과 line-clamp를 확인합니다',
    subtitle: '딱 1분만 들려주세요',
    ctaText: '의견 남기기',
    ctaUrl: '/events/qa-survey?src=hero',
  },
}

function Labeled({ name, testid, children }: { name: string; testid: string; children: React.ReactNode }) {
  return (
    <section data-testid={testid} className="mb-10">
      <h2 className="text-lg font-bold mb-3">{name}</h2>
      <div className="max-w-[420px] border border-border rounded-xl overflow-hidden">{children}</div>
    </section>
  )
}

export default function EventPreviewClient() {
  return (
    <div className="max-w-[900px] mx-auto px-4 py-8">
      <p className="mb-2 text-sm font-bold text-red-600">⚠️ QA 전용 · noindex · 비링크 — 실사용자 노출 없음</p>
      <p className="mb-8 text-sm text-muted-foreground">
        참여 이벤트 3종 HERO 입구를 실제 렌더러로 표시합니다. 긴 설명이 입구에 노출되지 않는지 검증용.
      </p>

      <Labeled name="VOTE (투표형 — 미니 투표판)" testid="preview-vote">
        <HeroSliderClient slides={[VOTE_SLIDE]} />
      </Labeled>

      <Labeled name="FEEDBACK (의견수렴형 — 일반 배너 입구)" testid="preview-feedback">
        <HeroSliderClient slides={[FEEDBACK_SLIDE]} />
      </Labeled>

      <Labeled name="SURVEY (1분 의견함 — 입구 전용)" testid="preview-survey">
        <HeroSliderClient slides={[SURVEY_SLIDE]} />
      </Labeled>
    </div>
  )
}
