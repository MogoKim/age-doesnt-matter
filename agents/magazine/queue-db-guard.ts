/**
 * 큐 forward safety — 이미 발행된 매거진과 같은 subtopic의 큐 후보를 제외하기 위한
 * DB read-only 로더. keyword-queue.selectOrderedCandidates에 publishedNorms로 주입한다.
 *
 * 배경(PR-1, 2026-07-21): keyword queue는 이미 production(MAGAZINE_KEYWORD_QUEUE_ENABLED=true)에서
 *   가동 중이고 26편을 발행했다. 라이브 실측 결과 빈둥지 증후군·갱년기 다이어트 등 일부 subtopic이
 *   반복 발행돼 SEO 자기잠식 우려가 있었다. 이 로더가 "이미 낸 주제"를 정규화해 큐가 앞으로 제외하게 한다.
 *   DB write 없음(findMany만). PUBLISHED/HIDDEN 매거진 모두 포함(숨김도 색인 흔적이 남을 수 있음).
 */
import { normalizeText } from './keyword-queue.js'

/** magazine-generator가 쓰는 prisma 클라이언트 최소 형태 — 크로스 import 회피용 구조 타입 */
export interface MagazinePostReader {
  post: {
    findMany: (args: {
      where: { boardType: 'MAGAZINE'; status: { in: Array<'PUBLISHED' | 'HIDDEN'> } }
      select: { title: true; seoTitle: true }
    }) => Promise<Array<{ title: string | null; seoTitle: string | null }>>
  }
}

/**
 * 발행된 매거진 title·seoTitle을 정규화(공백·문장부호 제거)한 문자열 배열로 반환.
 * 큐 후보의 keywordCore가 이 문자열 중 하나의 부분문자열이면 = 같은 subtopic → 제외.
 * 조회 실패 시 빈 배열(가드 미작동이 발행을 막지 않음 — fail-open).
 */
export async function loadPublishedMagazineNorms(prisma: MagazinePostReader): Promise<string[]> {
  try {
    const posts = await prisma.post.findMany({
      where: { boardType: 'MAGAZINE', status: { in: ['PUBLISHED', 'HIDDEN'] } },
      select: { title: true, seoTitle: true },
    })
    const norms: string[] = []
    for (const p of posts) {
      const t = normalizeText(p.title ?? '')
      const s = normalizeText(p.seoTitle ?? '')
      if (t.length >= 4) norms.push(t)
      if (s.length >= 4 && s !== t) norms.push(s)
    }
    return norms
  } catch {
    return []
  }
}
