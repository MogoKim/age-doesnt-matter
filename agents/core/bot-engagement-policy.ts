/**
 * 봇 engagement(댓글·대댓글·좋아요) 게시판 정책 — 단일 진실의 원천(SSoT)
 *
 * MAGAZINE/JOB은 SEO·정보 제공용 콘텐츠라 신규 봇 댓글·대댓글·좋아요를 운영하지 않는다.
 * (사람 댓글/비회원 댓글/회원 댓글은 src/lib/actions 경로에서 그대로 유지 — 이 정책 무관)
 *
 * 모든 봇 engagement 생성 직전에 isBotEngagementEnabledBoard()로 가드하여,
 * 레거시 CommentWaveQueue나 과거 스케줄이 실행돼도 생성 직전에서 차단되도록 한다.
 */

/** 봇 engagement(댓글·대댓글·좋아요) 허용 게시판 */
export const BOT_ENGAGEMENT_BOARD_TYPES = ['STORY', 'HUMOR', 'LIFE2'] as const
export const BOT_ENGAGEMENT_BOARD_SET = new Set<string>(BOT_ENGAGEMENT_BOARD_TYPES)

/** 봇 skip 사유 표준 문자열 (BotLog details / skipReason 기록용) */
export const BOARD_ENGAGEMENT_DISABLED_REASON = 'board_engagement_disabled'

/**
 * 해당 boardType에 봇 engagement(댓글·대댓글·좋아요)를 달 수 있는가?
 * STORY/HUMOR/LIFE2만 true. MAGAZINE/JOB/WEEKLY/기타/null = false.
 */
export function isBotEngagementEnabledBoard(boardType: string | null | undefined): boolean {
  return !!boardType && BOT_ENGAGEMENT_BOARD_SET.has(boardType)
}
