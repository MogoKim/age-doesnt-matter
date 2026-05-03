import { prisma, disconnect } from '../core/db.js'
import { generatePost, generateComment, generateReply, getBotUser, DESIRE_PERSONA_MAP } from './generator.js'
import { scheduleChainFromPost } from './controversy-chain.js'
import { loadTodayBrief, getPersonaQuota } from '../core/intelligence.js'
import type { ControversyTopic } from '../core/intelligence.js'
import { getPersona } from './persona-data.js'
import { safeBotLog } from '../core/safe-log.js'

/** 페르소나 → 욕망 카테고리 역방향 매핑 (다양성 캡용) */
const PERSONA_DESIRE: Record<string, string> = {}
for (const [desire, { personas }] of Object.entries(DESIRE_PERSONA_MAP)) {
  for (const pid of personas) {
    // 한 페르소나가 여러 욕망에 매핑된 경우 첫 번째 욕망 우선
    if (!(pid in PERSONA_DESIRE)) PERSONA_DESIRE[pid] = desire
  }
}

/** 시간대당 욕망 카테고리별 최대 글쓰기 수 — 쏠림 방지 */
const MAX_POSTS_PER_DESIRE = 2

/**
 * 시드 콘텐츠 스케줄러 (50명 — A~T + U~Z + AA~AI + AJ~AX)
 * 크롤링 08:30/12:30/20:40에 연동하여 시드봇 활동
 * 활동: 글쓰기, 댓글, 대댓글, 좋아요
 *
 * 성격 분포: 긍정(12) + 중립(10) + 부정/비판(8) + 특이(5) + 신규(15) = 50명
 * 게시판 분포: STORY(22) + HUMOR(4) + JOB(1) + LIFE2(6) + 크로스보드 활동
 */

type ActivityType = 'post' | 'comment' | 'reply' | 'like'

interface Activity {
  personaId: string
  type: ActivityType
  board?: string
  count?: number
  controversySeed?: ControversyTopic  // 논쟁 체인 시드 (Fix 13-E)
  targetPostId?: string               // 논쟁 댓글 타겟 글 ID
}

/**
 * 시간대별 활동 스케줄 (50명)
 * 08:30 크롤링 → 09:00/10:00 시드
 * 12:30 크롤링 → 13:00/14:00 시드
 * 20:40 크롤링 → 21:00/22:00 시드
 * + 15:00/16:00/19:00 자체 활동
 *
 * 일일 목표: 글 25-30개, 댓글 150-200개, 좋아요 100-120개, 대댓글 60-80개
 */
const SCHEDULE: Record<string, Activity[]> = {
  // ── 아침 (크롤링 08:30 후) ──
  '09': [
    // 글쓰기 — 아침형 페르소나
    { personaId: 'A', type: 'post' },                          // 하늘바라기 일상
    { personaId: 'F', type: 'post' },                          // 텃밭언니 아침 텃밭
    { personaId: 'J', type: 'post' },                          // 맛있는거좋아 아침 요리
    { personaId: 'L', type: 'post' },                          // 손주러브 가족
    { personaId: 'Q', type: 'post' },                          // 멍멍이엄마 아침 산책
    { personaId: 'U', type: 'post' },                          // 부산아지매 시장 이야기
    { personaId: 'AI', type: 'post' },                         // 시골아낙네 아침 텃밭
    // 댓글
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 3 },  // ㅋㅋ요정 리액션
    { personaId: 'U', type: 'comment', board: 'STORY', count: 2 },  // 부산아지매 직설 반응
    // 좋아요
    { personaId: 'E', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'L', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AI', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 2 }, // 조용한수다 아침
    { personaId: 'AV', type: 'like', board: 'STORY', count: 2 },
  ],

  '10': [
    // 글쓰기 — 정보형 + 활발형
    { personaId: 'B', type: 'post' },                          // 정순씨 정보
    { personaId: 'G', type: 'post' },                          // 여행이좋아 여행
    { personaId: 'K', type: 'post' },                          // 예쁘게살자 패션
    { personaId: 'M', type: 'post' },                          // 산이좋아 등산
    { personaId: 'V', type: 'post' },                          // 세상에나 불만 (부정)
    { personaId: 'AF', type: 'post', board: 'HUMOR' },         // 하하호호 아재개그
    { personaId: 'R', type: 'post', board: 'HUMOR' },          // 밤새봤다 드라마 감상
    { personaId: 'C', type: 'post', board: 'HUMOR' },          // ㅋㅋ요정 유머
    // 대댓글 — 아침 글에 답글
    { personaId: 'A', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'U', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'B', type: 'reply', board: 'STORY', count: 2 },  // Fix 14
    { personaId: 'G', type: 'reply', board: 'STORY', count: 1 },  // Fix 14
    // 좋아요
    { personaId: 'C', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'K', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'V', type: 'like', board: 'STORY', count: 2 },
  ],

  '11': [
    // 글쓰기 — 간병·건강 페르소나
    { personaId: 'AJ', type: 'post' },                          // 간병일기 간병
    { personaId: 'AN', type: 'post' },                          // 약국단골 영양제
    { personaId: 'AT', type: 'post' },                          // 자격증도전 공부
    { personaId: 'AY', type: 'post', board: 'HUMOR' },         // 웃음보따리 일상 유머
    // 댓글 — 신규 페르소나 반응
    { personaId: 'AK', type: 'comment', board: 'STORY', count: 3 }, // 우리엄마 공감
    { personaId: 'AM', type: 'comment', board: 'STORY', count: 2 }, // 불안한밤 질문
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 3 }, // 조용한수다 짧은공감
    { personaId: 'AP', type: 'comment', board: 'HUMOR', count: 3 }, // 짤방요정 리액션
    // 대댓글
    { personaId: 'AK', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AN', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'AJ', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AQ', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AP', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'T', type: 'like', board: 'LIFE2', count: 2 },   // 배움은즐거워 LIFE2 응원
    { personaId: 'AB', type: 'like', board: 'LIFE2', count: 2 },  // 따져보자 LIFE2 관심
  ],

  // ── 점심 (크롤링 12:30 후) ──
  '13': [
    // 댓글 위주 — 부정/비판 캐릭터 활동 시작
    { personaId: 'D', type: 'comment', board: 'JOB', count: 2 },     // 궁금한건못참아 질문
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },   // 봄바람 공감
    { personaId: 'W', type: 'comment', board: 'STORY', count: 2 },   // 참나진짜 비판 (!)
    { personaId: 'X', type: 'comment', board: 'STORY', count: 2 },   // 걱정인형 걱정
    { personaId: 'N', type: 'comment', board: 'STORY', count: 2 },   // 알뜰맘 정보
    { personaId: 'AC', type: 'comment', board: 'STORY', count: 1 },  // 느긋이 느긋 반응
    // 좋아요
    { personaId: 'D', type: 'like', board: 'JOB', count: 2 },
    { personaId: 'J', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'X', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AS', type: 'comment', board: 'JOB', count: 2 },   // 일자리헌터
    { personaId: 'AT', type: 'comment', board: 'STORY', count: 2 },  // 자격증도전
    { personaId: 'AN', type: 'comment', board: 'STORY', count: 2 },  // 약국단골
  ],

  '14': [
    // 글쓰기 — 오후 활동
    { personaId: 'B', type: 'post', board: 'LIFE2' },           // 정호씨 은퇴/재테크 정보
    { personaId: 'H', type: 'post' },                          // 매일걷기 건강 데이터
    { personaId: 'N', type: 'post' },                          // 알뜰맘 살림 팁
    { personaId: 'T', type: 'post' },                          // 배움은즐거워 교육
    { personaId: 'X', type: 'post' },                          // 걱정인형 걱정 글 (부정)
    { personaId: 'AZ', type: 'post', board: 'LIFE2' },         // 돈공부중 재테크 현실
    { personaId: 'AA', type: 'post' },                         // 어휴답답 한탄 (부정)
    { personaId: 'AG', type: 'post' },                         // 비교분석왕 비교 리뷰
    // 댓글
    { personaId: 'J', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AA', type: 'comment', board: 'STORY', count: 1 },  // 어휴답답 한탄 댓글
    // 대댓글
    { personaId: 'E', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'W', type: 'reply', board: 'STORY', count: 1 },   // 참나진짜 반박 답글
    { personaId: 'H', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'N', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'T', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AG', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'Y', type: 'like', board: 'LIFE2', count: 2 },   // 솔직히말해서 LIFE2 공감
    { personaId: 'H', type: 'like', board: 'LIFE2', count: 2 },   // 매일걷기 LIFE2 공감
  ],

  // ── 오후 자체 활동 ──
  '15': [
    // 글쓰기 — 감성 + 논쟁
    { personaId: 'P', type: 'post' },                          // 오후세시 감성 에세이
    { personaId: 'Z', type: 'post' },                          // 혼자잘산다 자조 유머
    { personaId: 'AB', type: 'post', board: 'LIFE2' },        // 따져보자 토론 주제
    { personaId: 'Y', type: 'post', board: 'LIFE2' },         // 솔직히말해서 현실 팩폭
    { personaId: 'AD', type: 'post' },                         // 그때그시절 회고
    { personaId: 'BA', type: 'post', board: 'LIFE2' },        // 은퇴D100 은퇴 준비 현실
    { personaId: 'BD', type: 'post' },                         // 고부갈등맘 서운함 토로
    // 댓글
    { personaId: 'K', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'AB', type: 'comment', board: 'STORY', count: 2 },  // 따져보자 반론
    { personaId: 'Z', type: 'comment', board: 'STORY', count: 1 },   // 혼자잘산다 한마디
    // 좋아요
    { personaId: 'P', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'G', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'Z', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'B', type: 'like', board: 'LIFE2', count: 3 },   // 정호씨 LIFE2 공감
    { personaId: 'AB', type: 'like', board: 'LIFE2', count: 2 },  // 따져보자 LIFE2 공감
  ],

  '16': [
    // 댓글 중심 — 다양한 반응
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'L', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'Q', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AD', type: 'comment', board: 'STORY', count: 2 },  // 그때그시절 "옛날에는~"
    { personaId: 'AH', type: 'comment', board: 'STORY', count: 2 },  // 피곤해요 공감
    { personaId: 'Y', type: 'comment', board: 'LIFE2', count: 1 },  // 솔직히말해서 팩폭
    // 대댓글
    { personaId: 'L', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AB', type: 'reply', board: 'LIFE2', count: 1 },
    // 좋아요
    { personaId: 'A', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AH', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'E', type: 'like', board: 'LIFE2', count: 2 },   // 봄바람 LIFE2 공감
    { personaId: 'L', type: 'like', board: 'LIFE2', count: 2 },   // 손주러브 LIFE2 관심
  ],

  '17': [
    // 글쓰기 — 오후 활동형
    { personaId: 'AL', type: 'post' },                          // 근육할머니 운동
    { personaId: 'AV', type: 'post' },                          // 혼밥일기 저녁 준비
    { personaId: 'AX', type: 'post', board: 'HUMOR' },          // 밴드여왕 온라인 챌린지/커뮤니티 이벤트
    // 댓글 — 대량 반응
    { personaId: 'AO', type: 'comment', board: 'HUMOR', count: 3 }, // 웃음충전 유머
    { personaId: 'AS', type: 'comment', board: 'JOB', count: 2 },   // 일자리헌터 정보
    { personaId: 'AW', type: 'comment', board: 'STORY', count: 2 }, // 손뜨개 느린 공감
    { personaId: 'AR', type: 'comment', board: 'STORY', count: 2 }, // 요즘세상 관찰
    { personaId: 'AU', type: 'comment', board: 'STORY', count: 2 }, // 체력왕 응원
    // 대댓글
    { personaId: 'AL', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AO', type: 'reply', board: 'HUMOR', count: 2 },
    { personaId: 'AS', type: 'reply', board: 'JOB', count: 1 },
    // 좋아요
    { personaId: 'AL', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AV', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AX', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'AU', type: 'like', board: 'STORY', count: 3 },
  ],

  // ── 저녁 ──
  '19': [
    // 글쓰기 — 저녁 감성 + 문화
    { personaId: 'I', type: 'post' },                          // 한페이지 독서
    { personaId: 'O', type: 'post' },                          // 올드팝 음악
    { personaId: 'W', type: 'post' },                          // 참나진짜 비판 리뷰
    { personaId: 'AH', type: 'post' },                         // 피곤해요 하루 TMI
    { personaId: 'S', type: 'post' },                          // 제주살이 저녁 풍경
    { personaId: 'BC', type: 'post' },                         // 억울한아내 남편 하소연
    { personaId: 'R', type: 'post', board: 'HUMOR' },          // 밤새봤다 저녁 드라마
    { personaId: 'T', type: 'post', board: 'LIFE2' },         // 배움은즐거워 수다방
    // 댓글
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'G', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'V', type: 'comment', board: 'STORY', count: 2 },   // 세상에나 불만 댓글
    { personaId: 'AC', type: 'comment', board: 'STORY', count: 1 },  // 느긋이 느긋 반응
    // 좋아요
    { personaId: 'I', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'O', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AJ', type: 'comment', board: 'STORY', count: 2 }, // 간병일기 저녁
    { personaId: 'AO', type: 'comment', board: 'HUMOR', count: 2 }, // 웃음충전
    { personaId: 'AW', type: 'comment', board: 'STORY', count: 1 }, // 손뜨개
    { personaId: 'AR', type: 'reply', board: 'STORY', count: 1 },   // 요즘세상
    { personaId: 'E', type: 'reply', board: 'STORY', count: 2 },    // Fix 14
    { personaId: 'S', type: 'reply', board: 'STORY', count: 2 },    // Fix 14
  ],

  '20': [
    // 저녁 댓글+대댓글 집중
    { personaId: 'AJ', type: 'comment', board: 'STORY', count: 2 }, // 간병일기 밤 글
    { personaId: 'AM', type: 'comment', board: 'STORY', count: 3 }, // 불안한밤 밤 활동
    { personaId: 'AK', type: 'comment', board: 'STORY', count: 2 }, // 우리엄마 저녁
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 2 }, // 조용한수다 저녁
    { personaId: 'AP', type: 'comment', board: 'HUMOR', count: 3 }, // 짤방요정 리액션
    { personaId: 'AW', type: 'comment', board: 'STORY', count: 2 }, // 손뜨개 저녁
    // 대댓글 — 체인 대화 유도
    { personaId: 'AJ', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'AV', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AR', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'AM', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AK', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AN', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 밤 (크롤링 20:40 후) ──
  '21': [
    // 밤 감성 페르소나 활동
    { personaId: 'AE', type: 'post' },                         // 새벽감성 밤 글
    { personaId: 'AC', type: 'post' },                         // 느긋이 느긋한 하루 마무리
    // 댓글
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'H', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'I', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'N', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'O', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'AF', type: 'comment', board: 'HUMOR', count: 2 },  // 하하호호 유머 댓글
    { personaId: 'AE', type: 'comment', board: 'STORY', count: 1 },  // 새벽감성 밤 댓글
    // 대댓글
    { personaId: 'C', type: 'reply', board: 'HUMOR', count: 1 },
    { personaId: 'R', type: 'reply', board: 'HUMOR', count: 1 },
    { personaId: 'V', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'B', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'Q', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AE', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AM', type: 'post' },                               // 불안한밤 밤 글
    { personaId: 'AE', type: 'reply', board: 'STORY', count: 2 },   // 새벽감성 대댓글
    { personaId: 'AJ', type: 'reply', board: 'STORY', count: 1 },   // 간병일기 대댓글
  ],

  '22': [
    // 마무리 활동
    { personaId: 'B', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AD', type: 'comment', board: 'STORY', count: 1 },  // 그때그시절 밤 회고
    // 대댓글
    { personaId: 'B', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AF', type: 'reply', board: 'HUMOR', count: 1 },
    // 좋아요 마무리
    { personaId: 'H', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'like', board: 'HUMOR', count: 2 },
    { personaId: 'W', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AA', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 심야 (Fix 10 — 잠 못 드는 00~01시) ──
  '00': [
    { personaId: 'E', type: 'post' },                               // 봄바람: 새벽 감성 글
    { personaId: 'AE', type: 'post' },                              // 새벽감성: 불면 이야기
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AQ', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'E', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'AE', type: 'like', board: 'STORY', count: 2 },
  ],
  '01': [
    { personaId: 'P', type: 'post' },                               // 오후세시: 늦은 밤 혼자만의 시간
    { personaId: 'AD', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'AE', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'P', type: 'like', board: 'STORY', count: 2 },
  ],
}

async function getRandomPosts(board: string, limit: number) {
  return prisma.post.findMany({
    where: { boardType: board as 'STORY' | 'HUMOR' | 'JOB' | 'LIFE2', status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit * 5, 200),  // Fix 14: 봇 댓글 3개 cap 대응
    select: { id: true, title: true, content: true, authorId: true },
  })
}

/** 댓글이 달린 글에서 대댓글 타겟 찾기 */
async function getReplyTargets(board: string, limit: number) {
  const comments = await prisma.comment.findMany({
    where: {
      post: { boardType: board as 'STORY' | 'HUMOR' | 'JOB' | 'LIFE2', status: 'PUBLISHED' },
      parentId: null,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
    select: {
      id: true,
      content: true,
      postId: true,
      authorId: true,
      post: { select: { title: true } },
    },
  })
  return comments.sort(() => Math.random() - 0.5).slice(0, limit)
}

/** 좋아요할 글 찾기 (아직 좋아요 안 한 글) */
async function getLikeTargets(userId: string, board: string, limit: number) {
  const posts = await prisma.post.findMany({
    where: {
      boardType: board as 'STORY' | 'HUMOR' | 'JOB' | 'LIFE2',
      status: 'PUBLISHED',
      NOT: { likes: { some: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
    select: { id: true, authorId: true },
  })
  return posts.sort(() => Math.random() - 0.5).slice(0, limit)
}

/** 페르소나 오늘 글쓰기 횟수 조회 (Fix 6 — 일 2회 제한) */
async function getTodayPostCount(personaId: string): Promise<number> {
  try {
    const KST_OFFSET = 9 * 60 * 60 * 1000
    const nowKst = new Date(Date.now() + KST_OFFSET)
    nowKst.setUTCHours(0, 0, 0, 0)
    const today = new Date(nowKst.getTime() - KST_OFFSET)
    const user = await prisma.user.findFirst({
      where: { email: `bot-${personaId.toLowerCase()}@unao.bot` },
      select: { id: true },
    })
    if (!user) return 0
    return prisma.post.count({
      where: { authorId: user.id, createdAt: { gte: today }, status: 'PUBLISHED' },
    })
  } catch { return 0 }
}

async function runActivity(activity: Activity): Promise<void> {
  const userId = await getBotUser(activity.personaId)

  if (activity.type === 'post') {
    // Fix 6: 하루 최대 2회 제한
    const todayCount = await getTodayPostCount(activity.personaId)
    if (todayCount >= 2) {
      console.log(`[Seed] ${activity.personaId} 글쓰기 스킵 (오늘 ${todayCount}회)`)
      return
    }

    const { title, content, boardType, category } = await generatePost(
      activity.personaId,
      activity.board,
      activity.controversySeed,  // Fix 13-E: controversyBlock 주입용
    )
    const htmlContent = `<p>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    const summary = content.replace(/\n/g, ' ').slice(0, 150).trim()

    // Fix 13-E: create() 반환값 직접 캡처 (findFirst race condition 방지)
    const newPost = await prisma.post.create({
      data: {
        title,
        content: htmlContent,
        summary,
        boardType: boardType as 'STORY' | 'HUMOR' | 'LIFE2',
        category: category ?? null,
        authorId: userId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      select: { id: true },
    })
    console.log(`[Seed] ${activity.personaId} posted: "${title}"`)

    // Fix 13-E: 논쟁글 생성 시 BotLog 기록 + 5단계 체인 예약
    if (activity.controversySeed) {
      await safeBotLog({
        botType: 'SEED',
        action: 'CONTROVERSY_POST_CREATED',
        status: 'SUCCESS',
        details: JSON.stringify({ postId: newPost.id, controversyType: activity.controversySeed.controversyType }),
        executionTimeMs: 0,
      }).catch(() => {})
      await scheduleChainFromPost(newPost.id, activity.personaId).catch(() => {})
    }
  }

  if (activity.type === 'comment') {
    const rawPosts = await getRandomPosts(activity.board ?? 'STORY', activity.count ?? 1)
    // 논쟁 체인 글이 있으면 우선 타겟에 포함 (16시 댓글 체인 연결)
    const controversyPost = await getControversyPost()
    const posts = controversyPost
      ? [controversyPost, ...rawPosts.filter(p => p.id !== controversyPost.id)]
      : rawPosts
    for (const post of posts.slice(0, activity.count ?? 1)) {
      const existingComment = await prisma.comment.findFirst({
        where: { postId: post.id, authorId: userId },
      })
      if (existingComment) continue

      const botCommentCount = await prisma.comment.count({
        where: {
          postId: post.id,
          author: { email: { endsWith: '@unao.bot' } },
        },
      })
      if (botCommentCount >= 3) continue

      const commentText = await generateComment(activity.personaId, post.title, post.content)
      if (commentText) {
        await prisma.$transaction([
          prisma.comment.create({
            data: { postId: post.id, authorId: userId, content: commentText },
          }),
          prisma.post.update({
            where: { id: post.id },
            data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
          }),
        ])
        console.log(`[Seed] ${activity.personaId} commented on: "${post.title.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'reply') {
    const targets = await getReplyTargets(activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      if (target.authorId === userId) continue

      const existingReply = await prisma.comment.findFirst({
        where: { parentId: target.id, authorId: userId },
      })
      if (existingReply) continue

      const replyText = await generateReply(activity.personaId, target.post.title, target.content)
      if (replyText) {
        await prisma.$transaction([
          prisma.comment.create({
            data: {
              postId: target.postId,
              authorId: userId,
              content: replyText,
              parentId: target.id,
            },
          }),
          prisma.post.update({
            where: { id: target.postId },
            data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
          }),
        ])
        console.log(`[Seed] ${activity.personaId} replied to comment: "${target.content.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'like') {
    const targets = await getLikeTargets(userId, activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.like.create({ data: { userId, postId: target.id } })
          const updatedPost = await tx.post.update({
            where: { id: target.id },
            data: { likeCount: { increment: 1 }, lastEngagedAt: new Date() },
            select: { likeCount: true },
          })
          if (target.authorId !== userId) {
            await tx.user.update({
              where: { id: target.authorId },
              data: { receivedLikes: { increment: 1 } },
            })
          }
          const newCount = updatedPost.likeCount
          if (newCount >= 50) {
            await tx.post.updateMany({
              where: { id: target.id, promotionLevel: { in: ['NORMAL', 'HOT'] } },
              data: { promotionLevel: 'HALL_OF_FAME' },
            })
          } else if (newCount >= 10) {
            await tx.post.updateMany({
              where: { id: target.id, promotionLevel: 'NORMAL' },
              data: { promotionLevel: 'HOT' },
            })
          }
        })
        console.log(`[Seed] ${activity.personaId} liked post ${target.id.slice(0, 8)}`)
      } catch {
        // unique constraint 위반 시 무시
      }
    }
  }
}

// ── 논쟁 체인 헬퍼 (Fix 13-E) ──

function buildControversyChain(seed: ControversyTopic, hour: string): Activity[] {
  if (hour === '14') {
    const authorMap: Record<string, string> = {
      family_conflict: 'BD', social_anger: 'W',
      dignity_hurt: 'Y', money_stress: 'AZ',
    }
    return [{ personaId: authorMap[seed.controversyType] ?? 'BD', type: 'post', controversySeed: seed }]
  }
  if (hour === '16') return [
    { personaId: 'W', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'E', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'X', type: 'comment', board: 'STORY', count: 1 },
  ]
  if (hour === '17') return [
    { personaId: 'BD', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AQ', type: 'reply', board: 'STORY', count: 1 },
  ]
  return []
}

async function getControversyPost(): Promise<{ id: string; title: string; content: string } | null> {
  try {
    const log = await prisma.botLog.findFirst({
      where: {
        botType: 'SEED',
        action: 'CONTROVERSY_POST_CREATED',
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    })
    if (!log?.details) return null
    const parsed = log.details as { postId?: string }
    if (!parsed.postId) return null
    return prisma.post.findFirst({
      where: { id: parsed.postId, status: 'PUBLISHED' },
      select: { id: true, title: true, content: true },
    })
  } catch { return null }
}

// 엔터 페르소나가 활성화될 시간대 (수다 많은 오전/오후)
const ENTERTAIN_HOURS = ['10', '13', '15', '21']

/**
 * buildDailySchedule — 오늘의 욕망 지도를 반영한 동적 스케줄 반환
 *
 * BASE_SCHEDULE(SCHEDULE)을 기반으로:
 * 1. 쿼터 배율이 높은 페르소나 → 댓글/좋아요 count 증가
 * 2. 쿼터 배율이 낮은 페르소나(< 0.9) → 글쓰기 스킵 (댓글/좋아요만 유지)
 * 3. entertainActive=true → EN1-EN5 해당 시간대에 추가
 * 4. midDayPatch → ±0.2 이내 미세 조정
 */
async function buildDailySchedule(hour: string): Promise<Activity[]> {
  const base = SCHEDULE[hour] ?? []

  // 브리프 없으면 BASE_SCHEDULE 그대로 반환 (폴백)
  const brief = await loadTodayBrief({ fallbackToPrevious: true, consumedBy: 'seed-scheduler' })
  if (!brief) return base

  const adjusted: Activity[] = []
  const postsByDesire: Record<string, number> = {}  // 욕망 카테고리별 이번 시간대 글쓰기 수
  const usedPrimaryTopics = new Set<string>()       // 소재 중복 방지 (페르소나 첫 번째 주제)

  for (const activity of base) {
    const quota = getPersonaQuota(brief, activity.personaId)

    // 글쓰기: quotaMultiplier < 0.9 이면 스킵 (댓글/좋아요는 유지)
    if (activity.type === 'post' && quota.quotaMultiplier < 0.9) {
      console.log(`[Seed] ${activity.personaId} 글쓰기 스킵 (quota ×${quota.quotaMultiplier.toFixed(2)})`)
      continue
    }

    // 글쓰기 다양성 캡 — 같은 욕망 카테고리 MAX_POSTS_PER_DESIRE 초과 시 스킵
    if (activity.type === 'post') {
      const desire = PERSONA_DESIRE[activity.personaId]
      if (desire) {
        const current = postsByDesire[desire] ?? 0
        if (current >= MAX_POSTS_PER_DESIRE) {
          console.log(`[Seed] ${activity.personaId} 글쓰기 스킵 (${desire} 캡 ${current}/${MAX_POSTS_PER_DESIRE})`)
          continue
        }
        postsByDesire[desire] = current + 1
      }

      // 소재 중복 방지 — 페르소나 첫 번째 주제 키워드 중복 시 스킵
      const persona = getPersona(activity.personaId)
      const primaryTopic = persona.topics[0]?.split(/[\s·,]+/)[0] ?? ''
      if (primaryTopic && usedPrimaryTopics.has(primaryTopic)) {
        console.log(`[Seed] ${activity.personaId} 글쓰기 스킵 (소재 중복: ${primaryTopic})`)
        continue
      }
      if (primaryTopic) usedPrimaryTopics.add(primaryTopic)
    }

    // count가 있는 활동: quotaMultiplier 반영
    if (activity.count !== undefined && quota.quotaMultiplier !== 1.0) {
      const newCount = Math.max(1, Math.round(activity.count * quota.quotaMultiplier))
      adjusted.push({ ...activity, count: newCount })
    } else {
      adjusted.push(activity)
    }

    // shouldBoost=true인 페르소나: 댓글 한 번 더 (post 타입 제외)
    if (activity.type !== 'post' && quota.shouldBoost && activity.count === undefined) {
      adjusted.push({ ...activity, count: 1 })
    }
  }

  // 엔터 페르소나 추가 (활성화된 경우)
  if (brief.entertainActive && ENTERTAIN_HOURS.includes(hour)) {
    const entertainPersonas = ['EN1', 'EN2', 'EN3', 'EN4', 'EN5']
    for (const personaId of entertainPersonas) {
      const quota = getPersonaQuota(brief, personaId)
      if (quota.quotaMultiplier <= 0) continue

      if (quota.quotaMultiplier >= 1.1) {
        // 글쓰기 + 댓글
        adjusted.push({ personaId, type: 'post', board: 'STORY' })
        adjusted.push({ personaId, type: 'comment', board: 'STORY', count: 1 })
      } else {
        // 댓글만 (quotaMultiplier 0.5 = 댓글 모드)
        adjusted.push({ personaId, type: 'comment', board: 'STORY', count: 1 })
      }
    }
  }

  // 논쟁 체인 주입 — 14시(글), 16시(댓글), 17시(대댓글)
  if (brief.controversySeeds?.length) {
    const seed = brief.controversySeeds[0]
    const chainActivities = buildControversyChain(seed, hour)
    adjusted.push(...chainActivities)
  }

  // midDayPatch 조정 (점심 이후 시간대)
  const patchHours = ['13', '14', '15']
  if (brief.midDayPatch && patchHours.includes(hour)) {
    const patch = brief.midDayPatch
    for (const { personaId, delta } of patch.adjustedPersonas) {
      // delta는 ±0.2 이내. 해당 페르소나의 count를 조정
      const idx = adjusted.findIndex(a => a.personaId === personaId && a.count !== undefined)
      if (idx !== -1) {
        const act = adjusted[idx]
        const base_ = act.count ?? 1
        const newCount = Math.max(1, Math.round(base_ * (1 + delta)))
        adjusted[idx] = { ...act, count: newCount }
      }
    }
  }

  return adjusted
}

/**
 * 집중 좋아요 라운드 — HOT 문턱(10) 근처 글에 좋아요 집중 투입
 * 하루 최대 2-3개 글만 타겟 → 자연스러움 유지
 */
async function focusedLikeRound(): Promise<number> {
  const nearHot = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      promotionLevel: 'NORMAL',
      likeCount: { gte: 5, lt: 10 },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { likeCount: 'desc' },
    take: 3,
    select: { id: true, authorId: true, likeCount: true },
  })

  if (nearHot.length === 0) return 0

  // 다양한 페르소나로 집중 투입 (긍정+중립+부정 믹스)
  const boostBotIds = ['B', 'E', 'G', 'K', 'M', 'AC', 'AI', 'AQ', 'AL', 'AU']
  let boosted = 0

  for (const post of nearHot) {
    for (const botId of boostBotIds) {
      const userId = await getBotUser(botId)
      try {
        await prisma.$transaction([
          prisma.like.create({ data: { userId, postId: post.id } }),
          prisma.post.update({
            where: { id: post.id },
            data: { likeCount: { increment: 1 } },
          }),
          prisma.user.update({
            where: { id: post.authorId },
            data: { receivedLikes: { increment: 1 } },
          }),
        ])
        boosted++
      } catch {
        continue
      }
    }
    const updated = await prisma.post.findUnique({
      where: { id: post.id },
      select: { likeCount: true },
    })
    if (updated && updated.likeCount >= 10) {
      await prisma.post.updateMany({
        where: { id: post.id, promotionLevel: 'NORMAL' },
        data: { promotionLevel: 'HOT' },
      }).catch(() => {})
      console.log(`[Seed] 집중 좋아요로 HOT 승격: ${post.id.slice(0, 8)} (${updated.likeCount}개)`)
    }
  }

  return boosted
}

async function main() {
  const now = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  const hour = kstHour.toString().padStart(2, '0')
  const activities = await buildDailySchedule(hour)

  if (!activities || activities.length === 0) {
    console.log(`[Seed] ${hour}시 — 예정된 활동 없음`)
    await disconnect()
    return
  }

  let successCount = 0
  let errorCount = 0

  for (const activity of activities) {
    try {
      await runActivity(activity)
      successCount++
    } catch (err) {
      console.error(`[Seed] ${activity.personaId} ${activity.type} 실패:`, err)
      errorCount++
    }
  }

  // 21시: 집중 좋아요 라운드
  let focusedCount = 0
  if (hour === '21') {
    focusedCount = await focusedLikeRound()
    if (focusedCount > 0) {
      console.log(`[Seed] 집중 좋아요 ${focusedCount}개 투입 완료`)
    }
  }

  await safeBotLog({
    botType: 'SEED',
    action: `SCHEDULE_${hour}`,
    status: errorCount === 0 ? 'SUCCESS' : 'PARTIAL',
    details: JSON.stringify({
      hour,
      success: successCount,
      errors: errorCount,
      totalActivities: activities.length,
      ...(focusedCount > 0 ? { focusedLikes: focusedCount } : {}),
    }),
    itemCount: successCount,
    executionTimeMs: 0,
  })

  console.log(`[Seed] ${hour}시 완료: 성공 ${successCount}, 실패 ${errorCount}`)
  await disconnect()
}

main().catch((err) => {
  console.error('[Seed] 치명적 오류:', err)
  process.exit(1)
})
