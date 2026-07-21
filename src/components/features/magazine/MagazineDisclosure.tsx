/**
 * 매거진 편집 고지 블록 (E-E-A-T 신뢰 신호) — 2026-07-21
 *
 * YMYL(건강·돈·연금·일자리) 콘텐츠에 "전문가 사칭 없이" 정직한 편집 성격 + 주의 문구를 노출.
 *  - 공통 고지: 전 매거진 (편집 성격 = 저자 신뢰 신호)
 *  - 카테고리별 주의: 실제 MAGAZINE category 분포 기준(건강 85·재테크 48·은퇴준비 20·일자리 11 = YMYL 72%)
 * 광고/경고처럼 튀지 않게 저채도 caption 톤. 본문·JSON-LD·title/meta 무관, 순수 표시 컴포넌트.
 */

interface MagazineDisclosureProps {
  category?: string | null
}

/** 카테고리 → YMYL 주의 문구. 해당 없으면 null(공통 고지만). */
function ymqlNote(category?: string | null): string | null {
  switch (category) {
    case '건강':
      return '건강 정보는 일반적인 참고용입니다. 증상이나 복용 중인 약은 사람마다 다를 수 있으니, 필요한 경우 의료진과 상담해 주세요.'
    case '재테크':
    case '은퇴준비':
      return '연금·재무 정보는 정책과 개인 상황에 따라 달라질 수 있습니다. 실제 결정 전 국민연금공단, 금융기관 등 공식 창구에서 확인해 주세요.'
    case '일자리':
      return '일자리와 자격 정보는 지역·기관·모집 시점에 따라 달라질 수 있습니다. 신청 전 공식 모집처에서 최신 내용을 확인해 주세요.'
    default:
      return null
  }
}

export default function MagazineDisclosure({ category }: MagazineDisclosureProps) {
  const note = ymqlNote(category)
  return (
    <aside
      className="mt-8 mb-8 rounded-xl border border-border bg-muted/30 px-4 py-3.5"
      aria-label="편집 안내"
    >
      <p className="text-caption leading-relaxed text-muted-foreground break-keep">
        이 글은 우나어 편집팀이 공개된 정보를 바탕으로 또래 눈높이에 맞춰 정리한 글입니다.
      </p>
      {note && (
        <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground break-keep">
          {note}
        </p>
      )}
    </aside>
  )
}
