/**
 * 창업자 페르소나 발행 — 후보 계정 카탈로그 (SSoT)
 *
 * 창업자가 **직접 쓴** 제목·본문을 이미 존재하는 페르소나 봇 계정 이름으로 발행할 때 쓰는
 * 후보 목록이다. 신규 계정을 만들지 않는다 — 여기 있는 건 "후보"일 뿐이고, 실제 선택 가능
 * 여부는 발행 시점에 DB에서 `status='ACTIVE'`인 User가 있는지로 결정된다.
 *
 * ## 이 목록의 출처 (재현 가능)
 *
 * 제거된 persona SSoT registry(`agents/core/persona-registry.ts`, PR #444 `5da81c1b`에서 REMOVE)에서
 * **`role === 'persona' && canWritePost === true`** 인 항목의 email만 추출했다.
 *
 * ```
 * git show 5da81c1b^:agents/core/persona-registry.ts   # buildRegistry()
 * → TOTAL 309 · role=persona 304 · canWritePost=true 289 (seed 64 + curator 225)
 * ```
 *
 * 제외된 것:
 *  - 스크래퍼봇 15종(`REACTION_ONLY_KEYS` BI~BW) — registry에서 `canWritePost: false`. 원글 작성 불가.
 *  - `official@unao.bot` — `role: 'official_operator'`. 운영 공식 계정이지 페르소나가 아니다.
 *  - system feed 봇 4종(`bot-job` 등) — `role: 'system_feed'`. 피드 봇이지 페르소나가 아니다.
 *
 * registry 자체는 runtime importer 0으로 판정돼 제거됐다. 되살리지 않는다 —
 * 이 파일은 그 판정 결과에서 **email 목록만** 떼어낸 정적 스냅샷이다.
 * 닉네임은 여기 두지 않는다. 화면에 보이는 이름은 항상 DB `User.nickname`이 정본이다.
 */

import type { BoardTypeId } from '@/lib/board-registry'

export type FounderPersonaOrigin = 'seed' | 'curator'

export interface FounderPersonaCandidate {
  /** DB User.email — 이 값으로만 계정을 조회한다(생성하지 않는다) */
  email: string
  origin: FounderPersonaOrigin
  /** 제거된 registry가 이 페르소나에 배정했던 기본 게시판 — 화면 힌트용, 제약이 아니다 */
  registryBoard: string
}

/** canWritePost=true였던 페르소나 289종 (seed 64 + curator 225) */
export const FOUNDER_PERSONA_CANDIDATES = [
  { email: 'bot-a@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-b@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'bot-c@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-d@unao.bot', origin: 'seed', registryBoard: 'JOB' },
  { email: 'bot-e@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-f@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-g@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-h@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-i@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-j@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-k@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-l@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-m@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-n@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-o@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-p@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-q@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-r@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-s@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-t@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-u@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-v@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-w@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-x@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-y@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'bot-z@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-aa@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ab@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'bot-ac@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ad@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ae@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-af@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-ag@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ah@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ai@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-aj@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ak@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-al@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-am@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-an@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ao@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-ap@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-aq@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ar@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-as@unao.bot', origin: 'seed', registryBoard: 'JOB' },
  { email: 'bot-at@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-au@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-av@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-aw@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-ax@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-ay@unao.bot', origin: 'seed', registryBoard: 'HUMOR' },
  { email: 'bot-az@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'bot-ba@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'bot-bc@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-bd@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-bf@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-bg@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-bh@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-en1@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-en2@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-en3@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-en4@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-en5@unao.bot', origin: 'seed', registryBoard: 'STORY' },
  { email: 'bot-bx@unao.bot', origin: 'seed', registryBoard: 'LIFE2' },
  { email: 'curator-a@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-b@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-c@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-e@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-f@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-g@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-h@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-i@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-j@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-k@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-l@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-m@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-n@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-o@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-p@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-q@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-r@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-s@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-t@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-u@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-v@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-w@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-x@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-y@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-z@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-aa@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-ab@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-ac@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-ad@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ae@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-af@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ag@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ah@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ai@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-aj@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ak@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-al@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-am@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-an@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ao@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ap@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-aq@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ar@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-as@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-at@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-au@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-av@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-aw@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-ax@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-ay@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-ca@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cb@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cc@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cd@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ce@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cf@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cg@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ch@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ci@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cj@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-ck@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cl@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cm@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cn@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-co@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cp@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cq@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cr@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-cs@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-ct@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-cu@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-cv@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-cw@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-cx@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-da@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-db@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dc@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dd@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-de@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-df@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dg@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dh@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-di@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dj@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dk@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dl@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dm@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dn@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-do@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dp@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dq@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dr@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-ds@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-dt@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-du@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-dv@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-dw@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-ea@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-eb@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h001@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h002@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h003@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h004@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h005@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h006@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h007@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h008@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h009@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h010@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h011@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h012@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h013@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h014@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h015@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h016@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h017@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h018@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h019@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h020@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h021@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h022@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-h023@unao.bot', origin: 'curator', registryBoard: 'HUMOR' },
  { email: 'curator-s001@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s002@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s003@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s004@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s005@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s006@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s007@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s008@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s009@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s010@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s011@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s012@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s013@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s014@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s015@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s016@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s017@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s018@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s019@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s020@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s021@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s022@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s023@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s024@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s025@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s026@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s027@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s028@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s029@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s030@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s031@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s032@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s033@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s034@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s035@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s036@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s037@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s038@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s039@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s040@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s041@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s042@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s043@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s044@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s045@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s046@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s047@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s048@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s049@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s050@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s051@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s052@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s053@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s054@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s055@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s056@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s057@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s058@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s059@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s060@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s061@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s062@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s063@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s064@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s065@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s066@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s067@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s068@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-s069@unao.bot', origin: 'curator', registryBoard: 'STORY' },
  { email: 'curator-l001@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l002@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l003@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l004@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l005@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l006@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l007@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l008@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l009@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l010@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l011@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l012@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l013@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l014@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l015@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l016@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l017@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l018@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l019@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l020@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l021@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l022@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l023@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l024@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l025@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l026@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l027@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l028@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l029@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l030@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l031@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l032@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l033@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
  { email: 'curator-l034@unao.bot', origin: 'curator', registryBoard: 'LIFE2' },
] as const satisfies readonly FounderPersonaCandidate[]

/** 후보 이메일 목록 — DB 조회 `where email in (...)` 에 그대로 쓴다 */
export const FOUNDER_PERSONA_EMAILS: readonly string[] = FOUNDER_PERSONA_CANDIDATES.map(
  (c) => c.email,
)

const CANDIDATE_BY_EMAIL = new Map<string, FounderPersonaCandidate>(
  FOUNDER_PERSONA_CANDIDATES.map((c) => [c.email, c]),
)

export function findFounderPersonaCandidate(email: string): FounderPersonaCandidate | undefined {
  return CANDIDATE_BY_EMAIL.get(email)
}

export function isFounderPersonaEmail(email: string): boolean {
  return CANDIDATE_BY_EMAIL.has(email)
}

// ─────────────────────────────────────────────────
// 발행 규칙 (게시판 · 입력 검증 · 중복 판정 키)
// ─────────────────────────────────────────────────

/**
 * 페르소나 발행을 허용하는 게시판.
 * 커뮤니티 4종으로 제한한다 — MAGAZINE(시리즈·전용 SEO 파이프라인)과
 * JOB(JobDetail 종속)은 별도 작성 경로가 있어 이 화면의 범위가 아니다.
 *
 * 페르소나별로 게시판을 제한하지는 않는다. registry의 `registryBoard`는 화면 힌트일 뿐이고,
 * 본문을 쓰는 주체가 창업자라 어느 게시판에 맞는 글인지도 창업자가 판단한다.
 */
export const FOUNDER_PERSONA_BOARD_TYPES = [
  'STORY',
  'LIFE2',
  'MENOPAUSE',
  'HUMOR',
] as const satisfies readonly BoardTypeId[]

export type FounderPersonaBoardType = (typeof FOUNDER_PERSONA_BOARD_TYPES)[number]

/**
 * 커뮤니티 slug를 생성하는 게시판.
 * `src/lib/actions/posts.ts` createPost의 COMMUNITY_BOARD_TYPES와 **같은 값이어야 한다**
 * (MENOPAUSE는 slug 없이 id 기반 URL — 회원 글과 동일하게 맞춘다).
 */
export const FOUNDER_PERSONA_SLUG_BOARD_TYPES = [
  'STORY',
  'HUMOR',
  'LIFE2',
] as const satisfies readonly FounderPersonaBoardType[]

/** 제목/본문 제약 — 회원 createPost와 동일하게 맞춘다(운영 일관성). */
export const FOUNDER_PERSONA_TITLE_MIN = 2
export const FOUNDER_PERSONA_TITLE_MAX = 40
export const FOUNDER_PERSONA_CONTENT_MIN = 10

/**
 * 중복 발행 판정 창(10분).
 * 연속 클릭·네트워크 재시도·서버 액션 자동 재요청을 모두 덮을 만큼 넉넉하되,
 * 같은 페르소나가 같은 게시판에 "제목·본문이 글자까지 같은 글"을 10분 안에 두 번 쓸 일은 없다.
 */
export const FOUNDER_PERSONA_DUPLICATE_WINDOW_MS = 10 * 60 * 1000

export function isFounderPersonaBoardType(value: string): value is FounderPersonaBoardType {
  return (FOUNDER_PERSONA_BOARD_TYPES as readonly string[]).includes(value)
}

/** 해당 게시판이 커뮤니티 slug 생성 대상인지 */
export function needsCommunitySlug(boardType: FounderPersonaBoardType): boolean {
  return (FOUNDER_PERSONA_SLUG_BOARD_TYPES as readonly string[]).includes(boardType)
}

/**
 * 중복 판정용 제목 정규화.
 * 재요청 사이에 앞뒤 공백·연속 공백·유니코드 합성 형태만 달라지는 경우를 같은 제목으로 본다.
 * DB에 저장되는 title은 정규화하지 않는다 — 판정에만 쓴다.
 */
export function normalizeFounderPersonaTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface FounderPersonaInput {
  /** 후보 카탈로그의 email — 폼이 주고받는 페르소나 식별자 */
  personaEmail: string
  boardType: string
  title: string
  content: string
}

export interface FounderPersonaValidated {
  candidate: FounderPersonaCandidate
  boardType: FounderPersonaBoardType
  title: string
  content: string
}

/**
 * 폼 입력 검증 — DB 접근이 없는 순수 함수라 클라이언트/서버 양쪽에서 같은 규칙을 쓴다.
 * 계정 존재·ACTIVE 여부는 여기서 판단하지 않는다(서버 액션의 DB 조회 단계 몫).
 */
export function validateFounderPersonaInput(
  input: FounderPersonaInput,
): { error: string } | { ok: FounderPersonaValidated } {
  const candidate = findFounderPersonaCandidate(input.personaEmail)
  if (!candidate) return { error: '후보 목록에 없는 페르소나입니다' }

  if (!isFounderPersonaBoardType(input.boardType)) {
    return { error: '이 화면에서 사용할 수 없는 게시판입니다' }
  }

  const title = input.title.trim()
  if (title.length < FOUNDER_PERSONA_TITLE_MIN || title.length > FOUNDER_PERSONA_TITLE_MAX) {
    return {
      error: `제목은 ${FOUNDER_PERSONA_TITLE_MIN}~${FOUNDER_PERSONA_TITLE_MAX}자로 입력해 주세요`,
    }
  }

  const content = input.content.trim()
  if (content.length < FOUNDER_PERSONA_CONTENT_MIN) {
    return { error: `본문은 ${FOUNDER_PERSONA_CONTENT_MIN}자 이상 입력해 주세요` }
  }

  return { ok: { candidate, boardType: input.boardType, title, content } }
}
