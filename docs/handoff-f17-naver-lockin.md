# Handoff — F17 네이버 유입자 락인 + 글상세 정리 (2026-06-12)

> 이 세션에서 한 작업 전부 + 진행 중/미결 항목. 다음 세션이 컨텍스트 없이 이어받기 위한 문서.
> 단일 진실: 코드 + `docs/features/F17-naver-lockin.md` + `.claude/plans/lovely-seeking-moth.md`

---

## 1. 한 줄 요약
네이버 오가닉(갱년기·건강 검색) 유입 비회원을 **한 편 더 읽고→가입**하게 락인. 글상세에 ①정체성 배너 ②같은 고민 글(관련글) ③측정을 넣고 배포 완료. **현재 "글상세가 정신 사납다"는 정리 작업이 미착수 상태**(아래 §5).

목표 지표: 세션당 PV 1.6→2.5 / 가입률 1%→3% / 비회원 재방문 2%↑. **효과 측정 재확인: 2026-06-26**.

---

## 2. 배포 완료된 커밋 (시간순, 전부 main 배포됨)
| 커밋 | 내용 |
|---|---|
| `2cd099f` | F17 락인 3종(커뮤니티) + 측정 이벤트 — 정체성 배너·본문끝 관련글·하단 관련글 교체 |
| `f048706` | QA 후속 — ①배너 클릭 이탈 제거(Link→div) ②관련글 정렬 인기순(trendingScore) ③배너 재디자인(실 로고 심볼+한 줄, ✕·dismiss 제거) |
| `764f931` | 배너 폰트 `text-[16px]`→`text-body`(18px) — '가+' 글씨크기 조정 반응(고정 px는 `--text-body` 변수 미적용이라 안 먹던 것) |
| `cf941f1` | 매거진 글상세에도 정체성 배너 적용(`boardSlug="magazine"`) |
| `023ebac` | 배너를 **제목 위**로 이동(제목→본문 흐름 깨끗) + 커뮤니티 PostCTA 아래 쿠팡 검색위젯 제거 |
| `acf258f` | 쿠팡 검색위젯(`CoupangSearchWidget`) **전체 제거**(매거진·일자리 포함). 하단 `CoupangBanner`는 유지 |

---

## 3. 현재 글상세 구조 (배포 상태)
**커뮤니티** `src/app/(main)/community/[boardSlug]/[postId]/page.tsx`:
뒤로가기 → **정체성 배너(①)** → 카테고리·제목·작성자 → 본문 → **본문끝 "같은 고민 글"(②, 상위3)** → 애드센스 → 액션바 → PostCTA(가입) → 댓글 → 쿠팡배너 → **하단 "다른 글"(관련글, 4~12위)**

**매거진** `src/app/(main)/magazine/[id]/page.tsx`: 뒤로가기 → **정체성 배너** → 헤더 → 본문 → … (관련글은 매거진 자체 `getRelatedMagazinePosts` 유지)

**배너 문구(확정)**: 메인 "우리 또래 여성들의 이야기 공간" / 서브 "40·50·60대 여성들의 진짜 이야기". 로고는 실제 `public/images/logo.png` 심볼(겹친 원)만 crop(텍스트 영역 overflow 가림). **클릭 이동 없음(div), ✕ 없음.**

---

## 4. 핵심 파일
- `src/components/features/community/IdentityBanner.tsx` — 정체성 배너(클라, 비회원만, `useSession`)
- `src/components/features/community/InlineRelatedPosts.tsx` — 본문끝 "같은 고민 글"(서버)
- `src/components/features/community/TrackedPostLink.tsx` — 관련글 클릭 추적 래퍼(클라)
- `src/components/features/community/PostListBottom.tsx` — `mode='related'`+`relatedPosts` prop
- `src/lib/queries/posts/posts.community.ts` — **`getRelatedCommunityPosts()`** (keyParts 고유 `['related-community-posts']`, tags `community-board-page` 공유, `trendingScore desc` 정렬, category 빈값 fallback)
- `src/app/api/events/route.ts` — `CONVERSION_EVENTS`에 `identity_banner_view`·`related_post_click` 면제
- 측정 eventName: `identity_banner_view`(작동 실측 3건) / `related_post_click`(properties: position inline|bottom). 클릭·dismiss 이벤트는 미사용(배너 div화로 제거).

---

## 5. ⭐ 진행 중 / 미결 — 다음 세션이 바로 이어갈 것

### 5-A. 글상세 "정신 사나움" 정리 (창업자 실기기 확인 후 요청, **미착수**)
창업자가 실기기로 보고 "정신 사납다"고 함. 정리 후보 4가지(창업자에게 multiSelect 질문하려다 중단됨 → 다음 세션에서 우선순위 확정):
1. **상단 "무료가입" 띠 제거** — "지금 가입하면 무조건! '무료'" 자극적 띠(`TopPromoBanner`, F10, DB Setting 관리). 정체성 배너와 상단 띠 2개 겹침 → 무료가입 띠 빼면 깔끔.
2. **🔴 관련글 품질 필터 (가장 중요)** — "비슷한 고민"인데 **"하나님의교회"·"라떼 자제"·"2시간 때우기"** 같은 무관 글이 뜸. 원인: STORY 건강 글 200개 중 199개가 봇/시드(실측)이고 **`category='건강'` 태깅이 부정확**. trendingScore 정렬해도 안 걸러짐. 해결안: ▸제목 키워드 매칭 추가(매거진 `getRelatedMagazinePosts`의 titleKeywords 패턴 차용) ▸댓글/좋아요 임계 필터 ▸시드 생성 시 category 재분류.
3. **관련글 중복 정리** — 본문끝 ②(상위3) + 하단 "다른 글"(4~12) 둘 다 관련글 → 과한 노출. 하나로 줄이거나 역할 분리.
4. **광고 밀도** — 애드센스(인아티클)+쿠팡배너(하단). ⚠️ 줄이면 수익↓ — 신중.

### 5-B. 배너 추가 논의(결정/보류)
- **클릭 동작**: 현재 **클릭 없음(div) 유지로 결정**. 이유=글 이탈 방지+역할분리(배너=인지/관련글=다음글/PostCTA=가입). 측정 욕심 있으면 "배너 클릭→카카오 가입 + `identity_banner_click`"로 전환 가능(보류).
- **정체성 강화**: 배너가 "누구(40·50·60대 여성)"는 명확하나 "무엇을 하는 곳/왜"가 약함. 서브를 행동형으로 바꾸는 안 제시됨(미적용): "갱년기·건강·일상 편하게 **터놓는** 곳" / "혼자 고민 말고 또래끼리 **나눠요**". → 5-A 정리와 함께 결정 권장.

---

## 6. WAIT (시간 경과 후)
- **F17 효과 측정** — 1~2주 EventLog 누적 후 세션당 PV·가입률·`related_post_click`/`identity_banner_view` 발생량으로 판정. **재확인: 2026-06-26 이후**. (pending_founder_actions.md에도 기록됨)

---

## 7. 다음 세션 시작 시 권장 순서
1. 이 문서 + `docs/features/F17-naver-lockin.md` 읽기
2. 창업자에게 §5-A 정리 우선순위 확정받기 (특히 **2번 관련글 품질**이 신뢰 직결 — 최우선 추천)
3. 관련글 품질: `getRelatedCommunityPosts`에 제목 키워드 매칭 or 품질 임계 추가 → 실측(임시 스크립트로 갱년기 글의 관련글이 실제 건강 글인지 확인) → 배포
4. 상단 무료가입 띠 제거(TopPromoBanner 어드민 Setting OFF or 코드)
5. 변경마다 tsc+build+커밋(pre-commit 통과 확인) → 배포 → 창업자 실기기 확인

## 8. 작업 규칙 메모(이 세션에서 확인된 것)
- 커밋 메시지에 heredoc(`$(cat <<EOF)`)·여러 `-m`·파이프(`| tail`) 섞으면 이 환경에서 도구 호출이 깨짐 → **단순 `-m "한 줄"` 1개**로 커밋할 것.
- tsc/build는 background(`run_in_background`)로 돌리고 알림 받기.
- 광고 컴포넌트 변경 시 smoke test + CSP 확인(CLAUDE.md qa-deploy).
- 멀티 AI 세션: `git add`는 항상 파일명 명시(`git add .` 금지).
