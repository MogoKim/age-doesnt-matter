/**
 * 정적 기록관 전용 문안 — 홈·소개·개인정보 안내·이용 안내.
 * 🔴 창업자 검토 전 초안이다. 운영 사이트 문안(src/app/(main)/about 등)은 회원 기능을
 * 전제로 써 있어 그대로 옮기지 않는다. 금지 표현(시니어·어르신·노인·실버) 사용 금지.
 */

export const SITE_NAME = '우리 나이가 어때서'
export const CONTACT_EMAIL = 'korea.age.not.matter@gmail.com' // 기존 개인정보처리방침 §11 에 이미 공개된 주소
export const CLOSED_LABEL = '2026년 10월'

export interface ArchiveSection {
  heading: string
  paragraphs: string[]
}

export interface ArchivePage {
  path: string
  title: string
  description: string
  h1: string
  lead: string
  sections: ArchiveSection[]
}

export const HOME: ArchivePage = {
  path: '/',
  title: `${SITE_NAME} — 기록 보관소`,
  description:
    '40대 중반부터 60대 중반 여성을 위해 만든 커뮤니티 우나어의 기록 보관소입니다. 운영은 마쳤고, 우나어에서 정리한 생활 가이드를 읽기 전용으로 남겨 두었어요.',
  h1: SITE_NAME,
  lead: `같은 또래 여성들과 일상과 인생 2막을 나누던 곳이에요. ${CLOSED_LABEL} 운영을 마쳤고, 지금은 우나어에서 정리한 생활 가이드만 읽기 전용 기록으로 남겨 두었어요.`,
  sections: [],
}

export const ABOUT: ArchivePage = {
  path: '/about',
  title: `소개 | ${SITE_NAME} 기록 보관소`,
  description: `${SITE_NAME}(우나어)가 어떤 곳이었는지, 지금은 어떻게 남아 있는지 안내합니다.`,
  h1: '우나어 소개',
  lead: '우나어는 아이들을 다 키우고 찾아온 조용한 시간을 같은 또래 여성들과 나누려고 만든 공간이었어요.',
  sections: [
    {
      heading: '어떤 곳이었나요',
      paragraphs: [
        '40대 중반부터 60대 중반 여성이 일상과 인생 2막 이야기를 나누던 커뮤니티였습니다.',
        '살림, 장보기, 여행, 운동, 재취업 준비처럼 자주 묻는 생활 정보를 가이드로 정리하기도 했어요.',
      ],
    },
    {
      heading: '지금은 어떻게 남아 있나요',
      paragraphs: [
        `${CLOSED_LABEL} 운영을 마쳤습니다. 회원가입, 로그인, 글쓰기, 댓글 같은 기능은 모두 닫았어요.`,
        '회원이 쓴 글과 댓글은 이 보관소에 싣지 않았습니다. 우나어에서 정리한 생활 가이드만 읽기 전용으로 남겨 두었어요.',
      ],
    },
    {
      heading: '문의',
      paragraphs: [`궁금한 점은 ${CONTACT_EMAIL} 로 메일을 보내 주세요.`],
    },
  ],
}

export const PRIVACY: ArchivePage = {
  path: '/privacy',
  title: `개인정보 안내 | ${SITE_NAME}`,
  description: '우나어 사이트의 개인정보 처리 안내입니다. 이 사이트는 방문자의 개인정보를 수집하지 않습니다.',
  h1: '개인정보 안내',
  lead: '이 사이트는 방문하시는 분의 개인정보를 따로 모으지 않습니다.',
  sections: [
    {
      heading: '수집하지 않는 것',
      paragraphs: [
        '회원가입·로그인·댓글·문의 양식이 없고, 쿠키·광고·방문 분석 도구도 쓰지 않습니다.',
        '다만 페이지를 전달하는 호스팅 사업자(Cloudflare)가 보안과 장애 대응을 위해 접속 기록을 자체 정책에 따라 처리할 수 있습니다.',
      ],
    },
    {
      heading: '기존 회원 정보',
      paragraphs: [
        '운영 종료와 함께 회원 정보를 이용하는 목적은 끝났습니다.',
        '서비스 복구에 대비한 암호화 백업만 짧은 기간 보관한 뒤 파기하며, 이 사이트에는 회원의 닉네임·글·댓글·프로필을 싣지 않습니다.',
      ],
    },
    {
      heading: '문의',
      paragraphs: [`개인정보 관련 문의: ${CONTACT_EMAIL}`],
    },
  ],
}

export const TERMS: ArchivePage = {
  path: '/terms',
  title: `이용 안내 | ${SITE_NAME}`,
  description: '우나어 사이트 이용 안내입니다.',
  h1: '이용 안내',
  lead: '이 사이트의 생활 가이드는 가입이나 결제 없이 읽으실 수 있어요.',
  sections: [
    {
      heading: '이용 방법',
      paragraphs: [
        '가이드 내용은 작성 당시 기준이에요. 가격·제도처럼 바뀌는 정보는 꼭 최신 내용을 다시 확인해 주세요.',
      ],
    },
    {
      heading: '저작권',
      paragraphs: ['이 사이트의 생활 가이드는 우나어에서 정리한 글입니다. 출처를 밝히지 않은 무단 복제는 삼가 주세요.'],
    },
    {
      heading: '문의',
      paragraphs: [`문의: ${CONTACT_EMAIL}`],
    },
  ],
}

/** 운영 사이트 /guide 페이지와 같은 분류·문구 (src/app/(main)/guide/page.tsx GUIDE_GROUPS) */
export const GUIDE_INDEX = {
  path: '/guide',
  title: '생활 가이드 — 40대 50대 60대 여성을 위한 쉬운 생활 정보',
  description:
    '50대 재취업, 장보기 물가, 안경알 교체, 운동 시작, 여행 옷차림처럼 우리 또래가 자주 묻는 생활 정보를 쉽게 정리했습니다.',
  groups: [
    {
      title: '일자리·재취업',
      description: '다시 일하고 싶은 우리 또래가 먼저 확인하면 좋은 가이드입니다.',
      slugs: ['50대-쿠팡알바-재취업-현실'],
    },
    {
      title: '생활·건강',
      description: '살림, 운동, 여행, 장보기처럼 매일의 선택을 쉽게 정리한 가이드입니다.',
      slugs: [
        '50대-크로스핏-운동-시작',
        '50대-유럽여행-옷차림',
        '마늘-한접-몇개-보관법',
        '안경알만-교체-가능-비용',
        '오이지-장아찌-담그는법',
        '50대-살기좋은지역-고르는법',
        '장보기-물가-줄이는법',
      ],
    },
  ],
} as const

/** 가이드·가이드 목록 title 접미사 — 운영 시절의 '여성 커뮤니티' 접미사는 쓰지 않는다 */
export const TITLE_SUFFIX = ' | 우리 나이가 어때서'
