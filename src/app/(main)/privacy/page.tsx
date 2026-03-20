import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8">개인정보처리방침</h1>

      <div className="prose-senior space-y-8 text-base text-foreground leading-[1.85] break-keep">
        <section>
          <h2 className="text-lg font-bold mb-3">1. 개인정보의 수집 및 이용 목적</h2>
          <p>
            우리 나이가 어때서(이하 &ldquo;우나어&rdquo;)는 다음의 목적을 위하여 개인정보를 처리합니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>회원 가입 및 관리: 본인 식별, 서비스 이용</li>
            <li>서비스 제공: 콘텐츠 제공, 일자리 정보 제공</li>
            <li>서비스 개선: 이용 통계, 서비스 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">2. 수집하는 개인정보 항목</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th className="text-left py-2 pr-4 font-bold">구분</th>
                  <th className="text-left py-2 pr-4 font-bold">항목</th>
                  <th className="text-left py-2 font-bold">필수/선택</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 로그인</td>
                  <td className="py-2 pr-4">회원번호, 닉네임, 프로필이미지</td>
                  <td className="py-2">필수</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 추가</td>
                  <td className="py-2 pr-4">이메일, 성별, 출생연도</td>
                  <td className="py-2">선택</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">서비스 이용</td>
                  <td className="py-2 pr-4">서비스 닉네임, 관심사, 지역</td>
                  <td className="py-2">선택</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">자동 수집</td>
                  <td className="py-2 pr-4">접속 로그, 기기 정보</td>
                  <td className="py-2">자동</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            회원 탈퇴 시 30일간 보관 후 파기합니다. 단, 관련 법령에 의해 보존이 필요한 경우
            해당 기간 동안 보관합니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>전자상거래 관련 기록: 5년</li>
            <li>접속 로그: 3개월</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">4. 개인정보의 제3자 제공</h2>
          <p>
            우나어는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
            다만, 법령의 규정에 의하거나 이용자의 동의가 있는 경우에는 예외로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">5. 개인정보의 파기</h2>
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 경우, 해당 개인정보를 지체 없이
            파기합니다. 전자적 파일은 복구 불가능한 방법으로 영구 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">6. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있으며,
            회원 탈퇴를 통해 개인정보의 삭제를 요청할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">7. 개인정보 보호책임자</h2>
          <p>
            개인정보 관련 문의는 문의 페이지를 통해 접수하실 수 있습니다.
          </p>
        </section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          시행일: 2026년 3월 1일
        </p>
      </div>
    </div>
  )
}
