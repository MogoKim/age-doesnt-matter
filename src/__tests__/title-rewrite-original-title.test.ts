import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Post.originalTitle 계약 — 제목 리라이팅 rollback 근거 (2026-08-14, PR-C)
 *
 * ## 왜 이 필드가 있나
 *
 * 제목 리라이팅(PR-D)은 Post.title을 바꾼다. 사고가 나면 되돌릴 근거가 있어야 한다.
 * M4·M4.5 두 번의 모델 실행에서 **매번 사실 오류가 1건씩 나왔고, 모델은 riskFlags: NONE +
 * 높은 confidence로 스스로 잡지 못했다.** 원제목을 잃으면 검수·비교·복구가 전부 불가능해진다.
 *
 * 기존 필드로는 대체할 수 없다 (2026-08-14 실측).
 *   · seoTitle — BOT 발행 7,647건 중 보유 3,780건(49%), 그중 title과 동일 3,117건.
 *                즉 41%만 우연한 백업이고 59%는 복구 불가. 게다가 어드민이 직접 수정할 수 있어
 *                (admin.content.ts) 백업으로 삼으면 어드민 수정이 rollback 근거를 덮어쓴다.
 *   · CafePost.title — cafePostId가 null인 Post가 2,371건(BOT의 31%)이고,
 *                CafePost.title은 원문 그대로라 발행 당시 제목과 다르다.
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. 필드가 nullable로 존재한다 (기존 10,614행 무영향의 근거)
 * 2. 아직 아무도 이 필드를 쓰지 않는다 (PR-C의 운영 영향 0)
 * 3. ★ slug·seoTitle이 title에서 파생된다는 사실 — "발행 후 UPDATE" 전제의 근거
 *
 * ⚠️ 이 PR이 merge돼도 DB에는 컬럼이 없다. DB 반영은 /prisma-guide 절차로 별도 승인받는다.
 *    따라서 PR-D는 DB 반영 이후에만 merge해야 한다.
 */

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

const schema = read('prisma/schema.prisma')
const postModel = schema.slice(schema.indexOf('model Post {'), schema.indexOf('model Post {') + 3000)

describe('Post.originalTitle — 스키마 계약', () => {
  it('Post 모델에 originalTitle이 있다', () => {
    expect(postModel).toContain('originalTitle')
  })

  it('originalTitle은 nullable이다 (기존 행이 전부 null이어도 안전)', () => {
    // String? 이 아니라 String 이면 기존 10,614행 때문에 ADD COLUMN이 실패한다
    expect(postModel).toMatch(/originalTitle\s+String\?/)
  })

  it('title은 여전히 non-null이다 (표시 제목 계약 불변)', () => {
    // 고객에게 보이는 제목은 title 하나뿐이다. 이게 nullable이 되면 20곳 이상이 깨진다
    expect(postModel).toMatch(/\n\s+title\s+String\n/)
  })

  it('originalTitle에 @unique·@default·인덱스를 걸지 않는다', () => {
    const line = postModel.split('\n').find(l => l.includes('originalTitle')) ?? ''
    expect(line).not.toContain('@unique')
    expect(line).not.toContain('@default')
    // 조회 조건이 아니라 rollback 시에만 읽는 필드다
    expect(postModel).not.toContain('[originalTitle]')
  })
})

describe('Post.originalTitle — 아직 어디에도 연결되지 않았다 (PR-C 운영 영향 0)', () => {
  const CURATORS = ['agents/cafe/content-curator.ts', 'agents/cafe/popular-curator.ts']

  it.each(CURATORS)('%s 가 originalTitle을 쓰지 않는다', (path) => {
    // PR-D에서 연결한다. 그 전까지 발행 동작은 바이트 단위로 동일해야 한다.
    expect(read(path)).not.toContain('originalTitle')
  })

  it('조회 계층(posts.base)이 originalTitle을 select하지 않는다', () => {
    // ⚠️ DB에 컬럼이 없는 상태에서 select하면 런타임 에러가 난다.
    //    DB 반영 전까지 이 필드를 읽는 코드가 있으면 안 된다.
    expect(read('src/lib/queries/posts/posts.base.ts')).not.toContain('originalTitle')
  })

  it('Prisma Client 타입에는 originalTitle이 생성돼 있다', () => {
    // 스키마에는 있고 코드는 안 쓰는 상태 — 이게 PR-C의 정상 상태다
    expect(read('src/generated/prisma/models/Post.ts')).toContain('originalTitle: string | null')
  })
})

describe('★ 제목 리라이팅은 발행 후 UPDATE로만 한다 — 발행 전 리라이팅 금지', () => {
  /**
   * 발행 시점에 title을 바꾸면 slug와 seoTitle이 함께 바뀐다.
   *   · slug는 @unique이고 URL을 결정한다 → 발행 전 리라이팅 = URL 변경
   *   · seoTitle은 `post.seoTitle ?? post.title`로 검색 노출 제목이 된다
   * 둘 다 네이버 노출면이다(CLAUDE.md seo-guard 보호 영역).
   *
   * 아래 테스트는 그 파생 구조를 고정한다. 구조가 바뀌면 테스트가 깨지고,
   * "발행 후 UPDATE" 전제를 다시 검토하게 된다.
   */
  it('content-curator의 slug가 title에서 파생된다', () => {
    expect(read('agents/cafe/content-curator.ts')).toContain('generateCommunitySlug(curated.title)')
  })

  it('popular-curator의 slug가 seoTitle/title에서 파생된다', () => {
    expect(read('agents/cafe/popular-curator.ts')).toContain('generateCommunitySlug(seo.seoTitle')
  })

  it('popular-seo의 seoTitle이 title에서 파생된다', () => {
    expect(read('agents/cafe/popular-seo.ts')).toContain('cutAtWord(title, SEO_TITLE_MAX)')
  })

  it('withinSource 가드는 영문·숫자만 검사한다 (한글 리라이팅을 막지 못한다)', () => {
    // 이 가드를 믿고 발행 전 리라이팅을 하면 안 된다는 근거.
    // 한글 표현이 바뀌어도 통과하므로 seoTitle이 리라이팅본으로 그대로 만들어진다.
    expect(read('agents/cafe/popular-seo.ts')).toContain('[A-Za-z]{2,}|\\d+')
  })

  it('sitemap은 title을 쓰지 않는다 (URL은 slug 기반 — 발행 후 UPDATE가 안전한 이유)', () => {
    // 발행 후 title만 바꾸면 sitemap·URL은 영향받지 않는다
    expect(read('src/app/sitemap.ts')).not.toContain('post.title')
  })
})

describe('PR-D 연결 시 지켜야 할 계약 (지금은 문서 역할)', () => {
  it('스키마 주석이 발행 후 UPDATE 원칙을 남기고 있다', () => {
    // 다음 사람이 발행 전 리라이팅을 시도하지 않도록 스키마 자체에 근거를 남긴다
    expect(postModel).toContain('발행 후 UPDATE')
  })

  it('스키마 주석이 표시·SEO 미사용 원칙을 남기고 있다', () => {
    expect(postModel).toContain('표시·SEO에 쓰지 않는다')
  })

  /**
   * PR-D 구현 시 강제할 규칙 (여기서는 검증하지 않는다 — 연결 코드가 아직 없다):
   *
   *   originalTitle: post.originalTitle ?? post.title
   *
   * 이미 값이 있으면 덮어쓰지 않는다. 여러 번 리라이팅해도 최초 원본이 보존된다.
   * PR-D에서 이 라인과 함께 실동작 테스트를 추가한다.
   */
  it('아직 리라이팅 적용 경로가 없다 (PR-D 전 상태 확인)', () => {
    const gate = read('agents/cafe/title-rewrite-gate.ts')
    expect(gate).toContain('아직 어디에도 연결되지 않았다')
    expect(gate).not.toContain('originalTitle')
  })
})
