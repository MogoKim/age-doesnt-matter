/**
 * 갱년기 톡(MENOPAUSE) 이동 글 확정 목록 (PR-M1 — 창업자 승인본, 순수 데이터)
 *
 * 용도:
 * 1) middleware: 옛 URL `/community/stories/{slug}` → 새 URL `/community/menopause/{slug}` HTTP 308
 *    (PR-M0 meta-refresh 스텁은 2차 안전망으로 유지. CUID URL은 여기 넣지 않음 — PR-M0 가드가 정본 수렴)
 * 2) scripts/move-menopause-posts.ts: boardType/category 이동 대상·매핑의 단일 소스
 *
 * 선별 기준(2026-07-24 dry-run 승인): 제목에 갱년기/폐경/완경 명시 · BOT/SHEET만(USER 0) ·
 * 매거진 0 · slug 보유 30/30 · 폐경/완경 제목 전수 포함(성욕 소재는 1건만 유지, #18/#19 교체) ·
 * 카테고리 균형 보정안 적용(완경·호르몬 12 / 몸의 변화 8 / 나만 이런가요 5 / 마음의 변화 3 / 가족·관계 2).
 *
 * GSC가 새 URL로 안정화되면(수 주) 이 redirect 맵은 제거 가능(이동 자체는 유지).
 */

export interface MovedPost {
  /** Post.id (CUID) — 이동 스크립트 대상 식별자 */
  id: string
  /** Post.slug — 불변(URL 정체성 유지) */
  slug: string
  /** 참고용 제목 */
  title: string
  /** 이동 후 갱년기 톡 카테고리 */
  newCategory: '나만 이런가요' | '몸의 변화' | '완경·호르몬' | '마음의 변화' | '가족·관계'
}

export const MENOPAUSE_MOVED_POSTS: readonly MovedPost[] = [
  { id: 'cmr32xatf0001003gurqjtfxr', slug: '완경이후-너무-힘들어요-원래-이런가요', title: '완경이후 너무 힘들어요 원래 이런가요..', newCategory: '완경·호르몬' },
  { id: 'cmror3wq8000l391mmopt5fbu', slug: '폐경후-살-찌나요', title: '폐경후 살 찌나요?', newCategory: '몸의 변화' },
  { id: 'cmrbjw20t000hld2yx7xtamtz', slug: '여성-폐경기-어떻게-이겨내나요', title: '여성 폐경기 어떻게 이겨내나요?', newCategory: '나만 이런가요' },
  { id: 'cmr3ap6u2000b2m5ndoqwf06w', slug: '폐경전이면-갱년기-아닌가요-폐경하면-더-아플까요', title: '폐경전이면 갱년기 아닌가요? 폐경하면 더 아플까요?', newCategory: '완경·호르몬' },
  { id: 'cmq0asthr00089a28o5ysglje', slug: '오늘부로-완경되었습니다', title: '오늘부로 완경되었습니다.^^', newCategory: '나만 이런가요' },
  { id: 'cmrjzjei5000mxb2y1f5ru2r7', slug: '갱년기-시작-폐경증상으로-유두통증', title: '갱년기 시작.. 폐경증상으로 유두통증ㅠ', newCategory: '완경·호르몬' },
  { id: 'cmr4k176u000agu2y3zswwjob', slug: '폐경-증상없이-잘-넘기신분-갱년기-조언', title: '폐경 증상없이 잘 넘기신분 갱년기 조언', newCategory: '완경·호르몬' },
  { id: 'cmq22h0pn00098q28kqjzu897', slug: '완경이행기-중에-배나옴-질문입니다', title: '완경이행기 중에 배나옴 질문입니다. ㅠㅠ', newCategory: '몸의 변화' },
  { id: 'cmq5w5jfe00078w28bxjy2qcg', slug: '폐경되신분들께-질문요', title: '폐경되신분들께 질문요', newCategory: '완경·호르몬' },
  { id: 'cmrsp5q720009qy2yb7i7qpqb', slug: '산부인과-추천갱년기-폐경', title: '산부인과 추천-갱년기, 폐경 ㅡㅡ', newCategory: '완경·호르몬' },
  { id: 'cmq6pj6y60005za2ydsyxriph', slug: '폐경-오기-전에도-갱년기증상-나타나기도-하죠', title: '폐경 오기 전에도 갱년기증상 나타나기도 하죠?', newCategory: '완경·호르몬' },
  { id: 'cmrvaeiqh00052b1m179idov9', slug: '50대-폐경후-질유산균-효과-있을까요', title: '50대 폐경후 질유산균 효과 있을까요', newCategory: '완경·호르몬' },
  { id: 'cmp16u97b0005ks2yxtwv55e8', slug: '폐경되면-장점이-더-큰가요-단점이-더-큰가요', title: '폐경되면 장점이 더 큰가요? 단점이 더 큰가요?', newCategory: '완경·호르몬' },
  { id: 'cmrg8nngm000h3m2cvg00dt6g', slug: '폐경-즘이면-성욕이-아예-사라지나요', title: '폐경 즘이면 성욕이 아예 사라지나요?', newCategory: '완경·호르몬' },
  { id: 'cmo57fn1w00011k3f39ss9hxr', slug: '폐경이-오니까-몸이-자꾸만-이상해요', title: '폐경이 오니까 몸이 자꾸만 이상해요...', newCategory: '몸의 변화' },
  { id: 'cmnpjl9150000zzzf6o8p8o5b', slug: '폐경-후-몸이-달라졌어요-저만-그런-건-아니죠', title: '폐경 후 몸이 달라졌어요, 저만 그런 건 아니죠?', newCategory: '몸의 변화' },
  { id: 'cmnn2fady000300zfxgqhvhny', slug: '폐경-이후-몸의-변화-어떻게-대처할까요', title: '폐경 이후 몸의 변화, 어떻게 대처할까요?', newCategory: '몸의 변화' },
  { id: 'cmoebzhms0016yr3fnc2uegb8', slug: '혹시-저만-요즘-화끈거리고-우울한-건가요-갱년기-맞을까봐', title: '혹시 저만 요즘 화끈거리고 우울한 건가요... 갱년기 맞을까봐', newCategory: '마음의 변화' },
  { id: 'cmrwx39mt000n2r1m6i3gc4ut', slug: '자꾸-눈물이-나는-갱년기', title: '자꾸 눈물이 나는 갱년기', newCategory: '마음의 변화' },
  { id: 'cmqm7asj70001i20jq6jdp50a', slug: '갱년기증상-있을때-남편과-많이-싸우시나요', title: '갱년기증상 있을때 남편과 많이 싸우시나요?', newCategory: '가족·관계' },
  { id: 'cmqt34t1u0004zy0jpvqt69lv', slug: '갱년기-호르몬치료-어떤선택을-하시려나요', title: '갱년기 호르몬치료 어떤선택을 하시려나요?', newCategory: '완경·호르몬' },
  { id: 'cmr3cmp070007zo3gg0d3qyk0', slug: '갱년기가-최고조로-올때는-언제인가요', title: '갱년기가 최고조로 올때는 언제인가요?', newCategory: '몸의 변화' },
  { id: 'cmr0umwdb00078r5necb8np6q', slug: '이곳은-갱년기카페인데', title: '이곳은 갱년기카페인데 ..', newCategory: '나만 이런가요' },
  { id: 'cmqch9ea90004930iup6a6bwa', slug: '갱년기-여름이-힘드네요', title: '갱년기  여름이 힘드네요.', newCategory: '나만 이런가요' },
  { id: 'cmr1hujin00048w5nk28isyr2', slug: '갱년기-되서-시어머니-손절-하신분-계실까요', title: '갱년기 되서 시어머니 손절 하신분 계실까요?', newCategory: '가족·관계' },
  { id: 'cmqroyhnc00078j0jbth6me9r', slug: '갱년기-마른-분들-복부에만-살이-붙는-분들-있으세요', title: '갱년기.. 마른 분들 복부에만 살이 붙는 분들 있으세요??', newCategory: '몸의 변화' },
  { id: 'cmnpfgfcn0003x9zfofx1ww2r', slug: '갱년기-증상-완화-3개월-먹어본-영양제-솔직-후기', title: '갱년기 증상 완화, 3개월 먹어본 영양제 솔직 후기', newCategory: '나만 이런가요' },
  { id: 'cmqq8aa890004050j9aicdiv8', slug: '갱년기-증상이-없는-분도-있나요', title: '갱년기 증상이 없는 분도 있나요', newCategory: '완경·호르몬' },
  { id: 'cmr2votsp0007953g5miitzan', slug: '갱년기-손가락-통증나았어요', title: '갱년기 손가락 통증~~나았어요~', newCategory: '몸의 변화' },
  { id: 'cmptm2n8n00000t28l14k2v1e', slug: '갱년기-증상-어떤-게-제일-힘드신가요', title: '갱년기 증상 어떤 게 제일 힘드신가요?', newCategory: '마음의 변화' },
] as const

const OLD_PREFIX = '/community/stories/'
const NEW_PREFIX = '/community/menopause/'

/** 옛 경로(디코드) → 새 경로. middleware O(1) 조회용 */
export const MOVED_POST_REDIRECTS: Record<string, string> = Object.fromEntries(
  MENOPAUSE_MOVED_POSTS.map((p) => [`${OLD_PREFIX}${p.slug}`, `${NEW_PREFIX}${p.slug}`]),
)

/**
 * middleware용: pathname이 이동 글의 옛 URL이면 새 경로 반환, 아니면 null.
 * nextUrl.pathname의 percent-encoding 여부가 런타임별로 다를 수 있어 디코드 후 대조(실패 시 원문 대조).
 */
export function getMovedPostRedirect(pathname: string): string | null {
  if (!pathname.startsWith(OLD_PREFIX)) return null
  let decoded = pathname
  try { decoded = decodeURIComponent(pathname) } catch { /* 원문 그대로 대조 */ }
  return MOVED_POST_REDIRECTS[decoded] ?? MOVED_POST_REDIRECTS[pathname] ?? null
}
