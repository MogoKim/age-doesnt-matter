'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * URL 쿼리를 **서버 렌더를 깨지 않고** 클라이언트로 전달한다.
 *
 * ## 왜 필요한가
 *
 * 목록 페이지들(`/community/[boardSlug]` · `/magazine` · `/jobs`)은 전부 `revalidate` 로
 * **정적 렌더**된다. 그런데 목록 컴포넌트가 `useSearchParams()` 를 **렌더 중에** 호출하면
 * Next 는 그 컴포넌트 트리를 **가장 가까운 Suspense 경계까지 CSR 로 bail out** 시킨다.
 * 결과는 서버 HTML 에 목록이 통째로 빠지는 것이다 — 실측(2026-09-10, production):
 * `/community/stories` 의 서버 HTML 은 내비·푸터 **380자**뿐이고 **글 링크 0건**이었다.
 * 글 제목은 RSC 페이로드 `<script>` 안에만 있었다.
 *
 * JS 를 실행하지 않는 수집기(네이버 Yeti 등)에게 목록은 **빈 껍데기**이고,
 * 글은 sitemap 으로만 발견된다. 내부 링크로 도달할 경로가 없다.
 *
 * ## 어떻게 푸는가
 *
 * `useSearchParams()` 호출을 **아무것도 그리지 않는 자식**으로 밀어 넣고 Suspense 로 감싼다.
 * bail out 은 이 자식(렌더 결과 `null`)까지만 번지므로 **부모 목록은 서버에서 정상 렌더**된다.
 * 부모는 서버가 준 첫 페이지를 그대로 그리고, hydration 이 끝난 뒤 이 다리가
 * `onChange` 로 실제 쿼리를 알려주면 그때부터 필터·정렬·검색·페이지가 동작한다.
 *
 * 값 전달을 `useEffect` 로 하는 이유: 렌더 도중 부모 state 를 바꾸면 React 가 경고하고,
 * 서버 HTML 과 클라이언트 첫 렌더가 달라져 hydration mismatch 가 된다.
 * 첫 렌더는 서버와 **똑같이** 그린 뒤 effect 에서 갱신해야 안전하다.
 *
 * ⚠️ 이 컴포넌트를 없애고 목록에서 `useSearchParams()` 를 직접 부르면 위 결손이 그대로 재발한다.
 * 회귀 방지: `src/__tests__/board-list-ssr.test.tsx`
 */
interface SearchParamsBridgeProps {
  /** 쿼리 문자열(`URLSearchParams.toString()`). 쿼리가 없으면 빈 문자열. */
  onChange: (queryString: string) => void
}

function Reporter({ onChange }: SearchParamsBridgeProps) {
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()

  useEffect(() => {
    onChange(queryString)
  }, [queryString, onChange])

  return null
}

export default function SearchParamsBridge({ onChange }: SearchParamsBridgeProps) {
  return (
    <Suspense fallback={null}>
      <Reporter onChange={onChange} />
    </Suspense>
  )
}
