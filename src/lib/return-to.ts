/**
 * 로그인·온보딩으로 보낼 때 붙이는 "원래 가려던 곳"(callbackUrl)을 만든다.
 *
 * 배경: middleware가 pathname만 넘겨서 쿼리가 사라졌다.
 * `/community/write?board=stories`로 가려던 사람이 로그인 뒤 `/community/write`로 떨어지고,
 * 글쓰기 폼은 board가 없으면 아무 안내 없이 첫 게시판을 골라버린다(그 순서도 DB 조회 순서다).
 * 신규 가입자는 온보딩까지 한 번 더 거치므로 같은 손실이 두 번 일어난다.
 *
 * 보안: **내부 경로 + 쿼리만** 만든다. 호스트·프로토콜은 절대 붙이지 않는다.
 * 되돌아갈 주소는 그대로 브라우저 이동에 쓰이므로, 외부로 나갈 수 있는 형태면 오픈 리다이렉트가 된다.
 * 판단이 서지 않는 입력은 null을 돌려주고, 호출부는 callbackUrl 자체를 붙이지 않는다
 * (= 로그인 후 기본 위치로 간다). 통과시키는 쪽이 아니라 버리는 쪽이 안전하다.
 */
export function buildReturnTo(pathname: string, search = ''): string | null {
  // 절대 경로만 — 상대 경로("community/write")는 기준이 어디냐에 따라 달라진다
  if (!pathname.startsWith('/')) return null

  // 프로토콜 상대 경로(//evil.com)는 브라우저가 외부 호스트로 읽는다
  if (pathname.startsWith('//')) return null

  // 백슬래시는 일부 브라우저가 슬래시처럼 다뤄 //evil.com과 같은 결과가 된다(/\evil.com)
  if (pathname.includes('\\') || search.includes('\\')) return null

  return `${pathname}${search}`
}
