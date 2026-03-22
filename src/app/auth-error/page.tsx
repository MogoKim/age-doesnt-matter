/**
 * ⚠️ 임시 디버그용 에러 페이지
 * NextAuth가 에러 발생 시 여기로 리다이렉트 → 에러 내용을 화면에 표시
 * 운영 시 제거 필요
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#FF6F61' }}>Auth 에러 디버그</h1>
      <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <p><strong>에러 코드:</strong> {error ?? '없음'}</p>
        <p><strong>시간:</strong> {new Date().toISOString()}</p>
      </div>
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>이 에러는 NextAuth OAuth 콜백 과정에서 발생했습니다.</p>
        <p>에러 유형:</p>
        <ul>
          <li><strong>Configuration</strong>: 서버 설정 오류 (secret, provider, callback 등)</li>
          <li><strong>AccessDenied</strong>: signIn 콜백에서 false 반환</li>
          <li><strong>Verification</strong>: 토큰 검증 실패</li>
          <li><strong>OAuthSignin</strong>: OAuth 시작 단계 실패</li>
          <li><strong>OAuthCallback</strong>: OAuth 콜백 처리 실패</li>
          <li><strong>OAuthAccountNotLinked</strong>: 계정 연결 실패</li>
        </ul>
      </div>
      <div style={{ marginTop: '20px' }}>
        <a href="/login" style={{ color: '#FF6F61' }}>← 로그인 페이지로</a>
        {' | '}
        <a href="/api/auth-debug?step=env" style={{ color: '#FF6F61' }}>환경변수 확인</a>
        {' | '}
        <a href="/api/auth-debug?step=db" style={{ color: '#FF6F61' }}>DB 확인</a>
      </div>
    </div>
  )
}
