/**
 * 에이전트 핸들러 레지스트리
 * runner.ts HANDLERS와 1:1 대응 — 어드민 현황 탭 + 모닝 리포트 공통 사용
 */

export type HandlerRunType = 'GHA' | 'LOCAL' | 'DISPATCH'

export interface HandlerMeta {
  key: string           // runner.ts 키 (예: 'ceo:morning-cycle')
  label: string         // 한국어 이름
  botType: string       // BotLog.botType 매칭용
  action: string | null // BotLog.action 매칭용 (null = 매칭 불가)
  schedule: string      // KST 실행 시간 표시용
  type: HandlerRunType
  workflow?: string     // .github/workflows/ 파일명 (GHA만)
  note?: string         // 특이사항
}

export const HANDLER_REGISTRY: HandlerMeta[] = [
  // ─── CEO ───────────────────────────────────────────────────────────
  { key: 'ceo:morning-cycle',        label: 'CEO 모닝 사이클',    botType: 'CEO',          action: 'MORNING_CYCLE',          schedule: '매일 09:00',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'ceo:morning-sns-briefing', label: 'CEO SNS 브리핑',     botType: 'CEO',          action: 'SNS_BRIEFING',           schedule: '매일 08:30',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'ceo:approval-reminder',    label: 'CEO 승인 리마인더',  botType: 'CEO',          action: 'APPROVAL_REMIND',        schedule: '매일 09:30',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'ceo:weekly-report',        label: 'CEO 주간 리포트',    botType: 'CEO',          action: 'WEEKLY_REPORT',          schedule: '월 10:00',             type: 'GHA',      workflow: 'agents-daily' },

  // ─── CTO ───────────────────────────────────────────────────────────
  { key: 'cto:health-check',         label: 'CTO 헬스체크',       botType: 'CTO',          action: 'HEALTH_CHECK',           schedule: '매 4시간',             type: 'GHA',      workflow: 'agents-hourly' },
  { key: 'cto:error-monitor',        label: 'CTO 에러 모니터',    botType: 'CTO',          action: 'ERROR_MONITOR',          schedule: '매 4시간',             type: 'GHA',      workflow: 'agents-hourly' },
  { key: 'cto:security-audit',       label: 'CTO 보안 감사',      botType: 'CTO',          action: 'SECURITY_AUDIT',         schedule: '매일 06:00',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cto:crawler-health',       label: 'CTO 크롤러 헬스',    botType: 'CTO',          action: 'CRAWLER_HEALTH',         schedule: '매일 07:00',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cto:arch-review',          label: 'CTO 아키텍처 리뷰',  botType: 'CTO',          action: 'ARCH_REVIEW',            schedule: '월 09:00',             type: 'GHA',      workflow: 'agents-weekly' },
  { key: 'cto:garbage-collect',      label: 'CTO 코드 GC',        botType: 'CTO',          action: 'GARBAGE_COLLECT',        schedule: '월 09:30',             type: 'GHA',      workflow: 'agents-weekly' },
  { key: 'cto:qa-verify',            label: 'CTO QA 검증',        botType: 'CTO',          action: 'QA_VERIFY',              schedule: '매일 23:45',           type: 'GHA',      workflow: 'agents-daily' },

  // ─── CMO ───────────────────────────────────────────────────────────
  { key: 'cmo:trend-analyzer',            label: 'CMO 트렌드 분석',    botType: 'CMO', action: 'TREND_ANALYSIS',         schedule: '매일 10:00',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cmo:caregiving-curator',        label: 'CMO 간병 큐레이터',  botType: 'CMO', action: 'CAREGIVING_CURATE',      schedule: '매일 10:15',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cmo:health-anxiety-responder',  label: 'CMO 건강불안 응답',  botType: 'CMO', action: 'HEALTH_ANXIETY_RESPOND', schedule: '매일 10:45',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cmo:humor-curator',             label: 'CMO 유머 큐레이터',  botType: 'CMO', action: 'HUMOR_CURATE',           schedule: '매일 11:15',           type: 'GHA',      workflow: 'agents-daily' },
  { key: 'cmo:social-poster',             label: 'CMO SNS 게시',       botType: 'CMO', action: 'SOCIAL_POST',            schedule: '07:00, 12:00, 15:00',  type: 'GHA',      workflow: 'agents-social' },
  { key: 'cmo:social-metrics',            label: 'CMO SNS 메트릭',     botType: 'CMO', action: 'SOCIAL_METRICS',         schedule: '매일 20:00',           type: 'GHA',      workflow: 'agents-social' },
  { key: 'cmo:social-reviewer',           label: 'CMO SNS 리뷰',       botType: 'CMO', action: 'SOCIAL_REVIEW',          schedule: '월+목 10:00',          type: 'GHA',      workflow: 'agents-social' },
  { key: 'cmo:social-strategy',           label: 'CMO SNS 전략',       botType: 'CMO', action: 'STRATEGY_MEMO',          schedule: '월+목 10:15',          type: 'GHA',      workflow: 'agents-social' },
  { key: 'cmo:threads-token-refresh',     label: 'CMO Threads 토큰',   botType: 'CMO', action: 'THREADS_TOKEN_REFRESH',  schedule: '수 10:00',             type: 'GHA',      workflow: 'agents-social' },
  { key: 'cmo:source-expander',           label: 'CMO 소스 확장',      botType: 'CMO', action: 'SOURCE_ANALYSIS',        schedule: '월 09:00',             type: 'GHA',      workflow: 'agents-weekly' },
  { key: 'cmo:content-gap-finder',        label: 'CMO 콘텐츠 갭',      botType: 'CMO', action: 'CONTENT_GAP_ANALYSIS',   schedule: '금 09:00',             type: 'GHA',      workflow: 'agents-weekly' },
  { key: 'cmo:channel-seeder',            label: 'CMO 채널 시더',      botType: 'CMO', action: 'CHANNEL_SEED',           schedule: '매일 11:30',           type: 'GHA',      workflow: 'agents-daily',  note: '효과 미확인' },
  { key: 'cmo:knowledge-responder',       label: 'CMO 지식 응답',      botType: 'CMO', action: 'KNOWLEDGE_RESPOND',      schedule: '화목토 12:00',         type: 'GHA',      workflow: 'agents-daily',  note: '네이버 세션 필요' },
  { key: 'cmo:seo-optimizer',             label: 'CMO SEO 최적화',     botType: 'CMO', action: 'SEO_MONITOR',            schedule: '월 08:00',             type: 'GHA',      workflow: 'agents-weekly' },
  { key: 'cmo:social-poster-visual',      label: 'CMO 카드뉴스 게시',  botType: 'CMO', action: null,                     schedule: '15:00',                type: 'GHA',      workflow: 'agents-social', note: '이미지 생성 의존' },
  { key: 'cmo:band-manager',              label: 'CMO Band 관리',      botType: 'CMO', action: 'BAND_MANAGE',            schedule: '—',                    type: 'DISPATCH',                            note: 'Band API 심사 대기' },
  { key: 'cmo:jisik-answerer',            label: 'CMO 지식인 답변',    botType: 'CMO', action: null,                     schedule: '수동',                 type: 'LOCAL',                               note: '네이버 IP 차단' },
  { key: 'cmo:google-ads-report',         label: 'CMO Google Ads',     botType: 'CMO', action: null,                     schedule: '—',                    type: 'DISPATCH',                            note: 'API 미설치' },

  // ─── COO ───────────────────────────────────────────────────────────
  { key: 'coo:moderator',             label: 'COO 모더레이션',    botType: 'COO', action: 'MODERATION',           schedule: '09:00, 15:00, 21:00',  type: 'GHA', workflow: 'agents-moderation' },
  { key: 'coo:content-scheduler',     label: 'COO 콘텐츠 스케줄', botType: 'COO', action: 'CONTENT_SCHEDULE',     schedule: '매일 14:00',           type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:trending-scorer',       label: 'COO 트렌딩 점수',   botType: 'COO', action: 'TRENDING_SCORE',       schedule: '12:00, 18:00',         type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:comment-activator',     label: 'COO 댓글 활성화',   botType: 'COO', action: 'COMMENT_ACTIVATE',     schedule: '10:30, 14:30, 20:00',  type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:reply-chain-driver',    label: 'COO 대댓글 체인',   botType: 'COO', action: 'REPLY_CHAIN_DRIVE',    schedule: '12:15, 18:30',         type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:connection-facilitator',label: 'COO 유저 연결',     botType: 'COO', action: 'CONNECTION_FACILITATE',schedule: '09:15, 15:00',         type: 'GHA', workflow: 'agents-daily' },
  { key: 'coo:job-scraper',           label: 'COO 일자리 수집',   botType: 'COO', action: 'JOB_SCRAPE',           schedule: '12:00, 16:00, 20:00',  type: 'GHA', workflow: 'agents-jobs' },
  { key: 'coo:job-matcher',           label: 'COO 일자리 매칭',   botType: 'COO', action: 'JOB_MATCH',            schedule: '매일 11:45',           type: 'GHA', workflow: 'agents-daily', note: '매칭 효과 미확인' },

  // ─── CPO ───────────────────────────────────────────────────────────
  { key: 'cpo:ux-analyzer',               label: 'CPO UX 분석',        botType: 'CPO', action: 'UX_ANALYZER',            schedule: '매일 11:00', type: 'GHA', workflow: 'agents-daily' },
  { key: 'cpo:feature-tracker',           label: 'CPO 기능 사용률',    botType: 'CPO', action: null,                     schedule: '월 11:30',   type: 'GHA', workflow: 'agents-daily' },
  { key: 'cpo:journey-analyzer',          label: 'CPO 사용자 여정',    botType: 'CPO', action: null,                     schedule: '월 12:00',   type: 'GHA', workflow: 'agents-daily' },
  { key: 'cpo:persona-diversity-checker', label: 'CPO 페르소나 다양성',botType: 'CPO', action: 'PERSONA_DIVERSITY_CHECK',schedule: '수 09:00',   type: 'GHA', workflow: 'agents-weekly' },

  // ─── CDO ───────────────────────────────────────────────────────────
  { key: 'cdo:kpi-collector',       label: 'CDO KPI 수집',    botType: 'CDO', action: 'KPI_DAILY',          schedule: '매일 22:00',  type: 'GHA', workflow: 'agents-daily' },
  { key: 'cdo:anomaly-detector',    label: 'CDO 이상 탐지',   botType: 'CDO', action: null,                 schedule: '매 4시간',    type: 'GHA', workflow: 'agents-hourly' },
  { key: 'cdo:engagement-optimizer',label: 'CDO 참여 최적화', botType: 'CDO', action: 'ENGAGEMENT_OPTIMIZE',schedule: '매일 22:30',  type: 'GHA', workflow: 'agents-daily' },

  // ─── CFO ───────────────────────────────────────────────────────────
  { key: 'cfo:cost-tracker',    label: 'CFO 비용 추적', botType: 'CFO', action: 'COST_TRACK',   schedule: '매일 23:00', type: 'GHA', workflow: 'agents-daily' },
  { key: 'cfo:revenue-tracker', label: 'CFO 수익 추적', botType: 'CFO', action: 'REVENUE_TRACK', schedule: '매일 23:30', type: 'GHA', workflow: 'agents-daily' },

  // ─── SEED ──────────────────────────────────────────────────────────
  { key: 'seed:scheduler', label: 'SEED 글쓰기',      botType: 'SEED', action: 'SCHEDULE', schedule: '09:00~22:00 (12슬롯)', type: 'GHA', workflow: 'agents-seed' },
  { key: 'seed:micro',     label: 'SEED 댓글/좋아요', botType: 'SEED', action: null,       schedule: '08:00, 12:00, 18:00, 23:00', type: 'GHA', workflow: 'agents-seed-micro' },

  // ─── QA ────────────────────────────────────────────────────────────
  { key: 'qa:content-audit', label: 'QA 콘텐츠 감사', botType: 'QA', action: 'CONTENT_AUDIT', schedule: '매일 08:20', type: 'GHA',      workflow: 'agents-daily' },
  { key: 'qa:code-gate',     label: 'QA 코드 게이트', botType: 'QA', action: 'CODE_GATE',     schedule: '—',         type: 'DISPATCH',                   note: '/done 스킬 자동 실행' },
  { key: 'qa:deploy-audit',  label: 'QA 배포 감사',   botType: 'QA', action: 'DEPLOY_AUDIT',  schedule: '—',         type: 'DISPATCH',                   note: 'Gate 2 자동 실행' },

  // ─── STRATEGIST ────────────────────────────────────────────────────
  { key: 'strategist:user-deep-analysis', label: '전략가 유저 심층 분석', botType: 'STRATEGIST', action: 'USER_DEEP_ANALYSIS', schedule: '목 09:00', type: 'GHA', workflow: 'agents-weekly' },

  // ─── COMMUNITY ─────────────────────────────────────────────────────
  { key: 'community:sheet-scrape', label: '커뮤니티 시트 스크랩', botType: 'COMMUNITY', action: 'SHEET_SCRAPE', schedule: '11:00, 21:00', type: 'GHA', workflow: 'agents-cafe' },

  // ─── CAFE CRAWLER ──────────────────────────────────────────────────
  { key: 'cafe_crawler:trend-analysis', label: '카페 트렌드 분석', botType: 'CAFE_CRAWLER', action: 'TREND_ANALYSIS',  schedule: '09:00, 13:30, 20:30',  type: 'GHA',      workflow: 'agents-cafe' },
  { key: 'cafe_crawler:content-curate', label: '카페 큐레이션',    botType: 'CAFE_CRAWLER', action: 'CONTENT_CURATE',  schedule: '09:00, 13:30, 20:30',  type: 'GHA',      workflow: 'agents-cafe' },
  { key: 'cafe_crawler:cafe-pipeline',  label: '카페 크롤링 (네이버)', botType: 'CAFE_CRAWLER', action: 'CAFE_CRAWL',  schedule: '08:30, 12:55, 20:00',  type: 'LOCAL',                          note: '네이버 IP 차단' },
  { key: 'cafe_crawler:external-crawl', label: '외부 크롤링',      botType: 'CAFE_CRAWLER', action: 'EXTERNAL_CRAWL', schedule: '—',                    type: 'DISPATCH',                       note: '2026-04-13 제거' },

  // ─── DESIGN ────────────────────────────────────────────────────────
  { key: 'design:ads-loop', label: '광고 크리에이티브', botType: 'DESIGN', action: null, schedule: '매일 09:05', type: 'GHA', workflow: 'agents-design', note: 'LOCAL ONLY 주석 있으나 GHA 등록됨' },
]

/** 팀별 그룹핑 (어드민 UI용) */
export const HANDLER_GROUPS = [
  { team: 'CEO',          emoji: '👑', keys: ['ceo:morning-cycle','ceo:morning-sns-briefing','ceo:approval-reminder','ceo:weekly-report'] },
  { team: 'CTO',          emoji: '🔧', keys: ['cto:health-check','cto:error-monitor','cto:security-audit','cto:crawler-health','cto:arch-review','cto:garbage-collect','cto:qa-verify'] },
  { team: 'CMO',          emoji: '📣', keys: ['cmo:trend-analyzer','cmo:caregiving-curator','cmo:health-anxiety-responder','cmo:humor-curator','cmo:social-poster','cmo:social-metrics','cmo:social-reviewer','cmo:social-strategy','cmo:threads-token-refresh','cmo:source-expander','cmo:content-gap-finder','cmo:channel-seeder','cmo:knowledge-responder','cmo:seo-optimizer','cmo:social-poster-visual','cmo:band-manager','cmo:jisik-answerer','cmo:google-ads-report'] },
  { team: 'COO',          emoji: '⚙️', keys: ['coo:moderator','coo:content-scheduler','coo:trending-scorer','coo:comment-activator','coo:reply-chain-driver','coo:connection-facilitator','coo:job-scraper','coo:job-matcher'] },
  { team: 'CPO',          emoji: '📦', keys: ['cpo:ux-analyzer','cpo:feature-tracker','cpo:journey-analyzer','cpo:persona-diversity-checker'] },
  { team: 'CDO',          emoji: '📊', keys: ['cdo:kpi-collector','cdo:anomaly-detector','cdo:engagement-optimizer'] },
  { team: 'CFO',          emoji: '💰', keys: ['cfo:cost-tracker','cfo:revenue-tracker'] },
  { team: 'SEED',         emoji: '🌱', keys: ['seed:scheduler','seed:micro'] },
  { team: 'QA',           emoji: '✅', keys: ['qa:content-audit','qa:code-gate','qa:deploy-audit'] },
  { team: '전략/커뮤니티', emoji: '🎯', keys: ['strategist:user-deep-analysis','community:sheet-scrape'] },
  { team: '카페 크롤러',  emoji: '☕', keys: ['cafe_crawler:trend-analysis','cafe_crawler:content-curate','cafe_crawler:cafe-pipeline','cafe_crawler:external-crawl'] },
  { team: 'Design',       emoji: '🎨', keys: ['design:ads-loop'] },
]
