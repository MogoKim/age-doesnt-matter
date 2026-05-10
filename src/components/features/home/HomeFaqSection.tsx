import { FaqAccordion } from '@/components/common/FaqAccordion'
import type { FaqItem } from '@/components/common/FaqAccordion'

const HOME_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '우리 나이가 어때서(우나어)는 어떤 커뮤니티인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '우리 나이가 어때서(우나어)는 50대·60대 중장년을 위한 온라인 커뮤니티입니다. 일상 이야기, 인생 2막 준비, 웃음, 건강·재테크 정보를 나누는 공간으로, 카카오 계정으로 무료 가입해 바로 이용할 수 있습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '50대 60대도 쉽게 쓸 수 있는 커뮤니티 앱이 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '우나어(우리 나이가 어때서)는 스마트폰에 최적화된 웹 서비스로, 별도 앱 설치 없이 카카오톡 계정으로 30초 안에 가입해 이용할 수 있습니다. 50대·60대가 편하게 쓸 수 있도록 큰 글씨와 간단한 화면으로 만들었습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '중장년이 인생 2막을 준비할 수 있는 온라인 공간이 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '우나어에는 재취업·창업·은퇴 준비를 함께 나누는 "2막준비" 게시판이 있습니다. 먼저 인생 2막을 시작한 분들의 경험담과 일자리 정보, 중장년 맞춤 매거진을 무료로 볼 수 있습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '50대 여성이 속마음을 털어놓을 수 있는 커뮤니티가 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '우나어는 50대·60대 여성이 갱년기, 빈둥지 증후군, 가족 관계 등 우리 또래만 아는 이야기를 편하게 나눌 수 있는 커뮤니티입니다. 닉네임으로만 활동하며 실명을 공개하지 않아도 됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '가입비 없이 50대 60대 커뮤니티를 이용할 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '우나어는 완전 무료 커뮤니티입니다. 가입비·월정액·광고 없이 카카오 계정으로 30초 안에 가입해 모든 기능을 이용할 수 있습니다.',
      },
    },
  ],
}

const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    q: '우나어가 뭐예요?',
    a: '50대·60대를 위한 온라인 커뮤니티예요. 일상 이야기, 인생 2막 준비, 웃음방, 건강·재테크 매거진까지 — 우리 또래 이야기가 다 모여 있어요.',
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '앱 설치 없이 바로 쓸 수 있어요. 카카오톡 계정으로 30초 안에 가입하면 스마트폰 브라우저에서 바로 이용 가능합니다.',
  },
  {
    q: '가입비가 있나요?',
    a: '완전 무료예요. 가입비도, 월정액도 없습니다. 카카오 계정만 있으면 모든 기능을 제한 없이 쓸 수 있어요.',
  },
  {
    q: '어떤 이야기를 나눌 수 있나요?',
    a: '사는이야기(일상 공감), 2막준비(재취업·창업·은퇴), 웃음방(우리 또래 유머), 매거진(건강·재테크·여행 정보) — 우리 나이에 필요한 모든 이야기를 나눌 수 있어요.',
  },
  {
    q: '내 정보가 공개되나요?',
    a: '닉네임으로만 활동해요. 실명이나 연락처를 공개할 필요가 없고, 카카오 로그인 시에도 이름·이메일을 수집하지 않습니다.',
  },
]

export default function HomeFaqSection() {
  return (
    <section className="px-4 py-6 lg:px-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_FAQ_SCHEMA) }}
      />
      <h2 className="text-title font-bold text-foreground mb-4">자주 묻는 질문</h2>
      <div className="flex flex-col gap-2">
        {HOME_FAQ_ITEMS.map((item) => (
          <FaqAccordion key={item.q} item={item} />
        ))}
      </div>
    </section>
  )
}
