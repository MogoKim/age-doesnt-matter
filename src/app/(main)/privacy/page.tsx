import type { Metadata } from 'next'

export const revalidate = 604800

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '우나어가 회원 정보를 안전하게 다루는 방법 안내.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/privacy` },
}

export default function PrivacyPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8">개인정보처리방침</h1>

      <div className="prose-senior space-y-8 text-body text-foreground leading-[1.85] break-keep">
        <section>
          <p>
            우리 나이가 어때서(이하 &ldquo;우나어&rdquo;)는 「개인정보 보호법」 제30조에 따라 이용자의 개인정보를
            보호하고 관련 고충을 신속하게 처리하기 위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.
            우나어는 40·50·60대 여성을 위한 커뮤니티 서비스입니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">1. 개인정보의 수집 및 이용 목적</h2>
          <p>우나어는 다음의 목적을 위하여 개인정보를 처리하며, 목적 이외의 용도로는 이용하지 않습니다.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>회원 가입 및 관리: 카카오 계정을 통한 본인 식별, 회원 가입 의사 확인 및 서비스 이용</li>
            <li>가입 자격 확인: 여성 전용 커뮤니티 운영을 위한 성별 확인</li>
            <li>맞춤 서비스 제공: 출생연도(연령대)를 기반으로 한 맞춤 콘텐츠 및 커뮤니티 서비스 제공</li>
            <li>서비스 제공: 콘텐츠 제공, 일자리 정보 제공, 회원 간 커뮤니티 활동 지원</li>
            <li>서비스 개선: 이용 통계 분석 및 서비스 품질 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">2. 수집하는 개인정보 항목</h2>
          <p>우나어는 카카오 로그인을 통해 다음의 개인정보를 수집합니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[17px] border-collapse mt-2">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th className="text-left py-2 pr-4 font-bold">구분</th>
                  <th className="text-left py-2 pr-4 font-bold">항목</th>
                  <th className="text-left py-2 pr-4 font-bold">수집 목적</th>
                  <th className="text-left py-2 font-bold">필수/선택</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 로그인</td>
                  <td className="py-2 pr-4">회원번호, 닉네임, 프로필이미지</td>
                  <td className="py-2 pr-4">회원 식별 및 서비스 이용</td>
                  <td className="py-2">필수</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 로그인</td>
                  <td className="py-2 pr-4">카카오계정(이메일)</td>
                  <td className="py-2 pr-4">서비스 안내 및 계정 관리</td>
                  <td className="py-2">필수</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 로그인</td>
                  <td className="py-2 pr-4">성별</td>
                  <td className="py-2 pr-4">여성 전용 커뮤니티 가입 자격 확인</td>
                  <td className="py-2">필수</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">카카오 로그인</td>
                  <td className="py-2 pr-4">출생연도</td>
                  <td className="py-2 pr-4">연령대 기반 맞춤 콘텐츠 제공</td>
                  <td className="py-2">필수</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">서비스 이용</td>
                  <td className="py-2 pr-4">서비스 닉네임, 관심사, 지역</td>
                  <td className="py-2 pr-4">프로필 설정 및 맞춤 서비스 제공</td>
                  <td className="py-2">선택</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">자동 수집</td>
                  <td className="py-2 pr-4">접속 IP, 쿠키, 기기·브라우저 정보, 서비스 이용 기록</td>
                  <td className="py-2 pr-4">서비스 보안, 통계 분석, 부정 이용 방지</td>
                  <td className="py-2">자동</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[17px] text-muted-foreground mt-3">
            ※ 필수 항목에 동의하지 않으실 경우 회원 가입이 제한됩니다. 선택 항목은 동의하지 않아도
            서비스를 이용하실 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            우나어는 원칙적으로 개인정보 수집·이용 목적이 달성되거나 회원 탈퇴 시 해당 정보를 파기합니다.
            회원 탈퇴 시 30일간 보관 후 파기하며, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>전자상거래 등에서의 소비자 보호에 관한 법률에 따른 기록: 관계 법령에서 정한 기간</li>
            <li>접속 로그(IP 등) 기록: 통신비밀보호법에 따라 3개월</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">4. 개인정보의 제3자 제공</h2>
          <p>
            우나어는 이용자의 개인정보를 본 방침 제1조에 명시한 범위 내에서만 처리하며, 이용자의 동의나
            법령의 규정 등 「개인정보 보호법」에서 정한 경우를 제외하고는 개인정보를 제3자에게 제공하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">5. 개인정보 처리의 위탁 및 국외 이전</h2>
          <p>
            우나어는 안정적인 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 일부 수탁사는
            국외에 서버를 두고 있어 개인정보가 국외로 이전·보관될 수 있습니다. 위탁받은 업무는 서비스 제공을 위한
            목적에 한정되며, 위탁 계약 시 개인정보가 안전하게 관리되도록 규정하고 있습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[17px] border-collapse mt-2">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th className="text-left py-2 pr-4 font-bold">수탁업체</th>
                  <th className="text-left py-2 pr-4 font-bold">위탁 업무</th>
                  <th className="text-left py-2 font-bold">이전 국가</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Supabase, Inc.</td>
                  <td className="py-2 pr-4">데이터베이스 운영 및 회원정보 저장</td>
                  <td className="py-2">미국 등</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Vercel, Inc.</td>
                  <td className="py-2 pr-4">웹 서비스 호스팅 및 운영</td>
                  <td className="py-2">미국 등</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Cloudflare, Inc.</td>
                  <td className="py-2 pr-4">이미지·파일 저장 및 콘텐츠 전송</td>
                  <td className="py-2">미국 등</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 pr-4">Google LLC</td>
                  <td className="py-2 pr-4">서비스 이용 분석(Google Analytics), 광고 게재(AdSense)</td>
                  <td className="py-2">미국 등</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[17px] text-muted-foreground mt-3">
            ※ 이전 항목: 본 방침에서 수집하는 개인정보 / 이전 시점: 서비스 이용 시점에 네트워크를 통해 이전 /
            보유·이용 기간: 위탁 계약 종료 또는 회원 탈퇴 시까지.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">6. 개인정보의 파기</h2>
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 경우, 해당 개인정보를 지체 없이 파기합니다.
            전자적 파일 형태의 정보는 복구가 불가능한 방법으로 영구 삭제하며, 종이 문서는 분쇄하거나 소각합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">7. 만 14세 미만 아동의 개인정보</h2>
          <p>
            우나어는 만 14세 미만 아동의 회원 가입을 허용하지 않으며, 만 14세 미만 아동의 개인정보를
            수집하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">8. 이용자 및 법정대리인의 권리와 행사 방법</h2>
          <p>
            이용자는 언제든지 자신의 개인정보를 조회·수정할 수 있으며, 동의 철회나 회원 탈퇴를 통해 개인정보의
            삭제를 요청할 수 있습니다. 권리 행사는 서비스 내 설정 또는 개인정보 보호책임자에게 연락하여 하실 수
            있으며, 우나어는 지체 없이 조치합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">9. 개인정보 자동 수집 장치(쿠키)의 설치·운영 및 거부</h2>
          <p>
            우나어는 이용자에게 맞춤형 서비스와 광고를 제공하기 위해 쿠키(cookie)를 사용합니다. 쿠키는 서비스
            이용 분석(Google Analytics) 및 광고(Google AdSense) 등에 활용됩니다. 이용자는 웹 브라우저 설정을
            통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">10. 개인정보의 안전성 확보 조치</h2>
          <p>우나어는 개인정보의 안전한 처리를 위해 다음과 같은 조치를 취하고 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>관리적 조치: 접근 권한 최소화 및 관리</li>
            <li>기술적 조치: 데이터베이스 접근 통제(행 수준 보안), 전송 구간 암호화(HTTPS)</li>
            <li>개인정보에 대한 접근 기록 보관 및 무단 접근 차단</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">11. 개인정보 보호책임자</h2>
          <p>
            우나어는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 개인정보 처리와 관련한 이용자의 문의·불만·
            피해 구제를 처리하기 위하여 개인정보 보호책임자를 두고 있습니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>개인정보 보호책임자: 우나어 운영자</li>
            <li>문의 이메일: korea.age.not.matter@gmail.com</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">12. 권익침해 구제 방법</h2>
          <p>
            개인정보 침해로 인한 상담 및 피해 구제가 필요하신 경우 아래 기관에 문의하실 수 있습니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청 사이버수사과: 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버수사국: 182 (ecrm.cyber.go.kr)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">13. 개인정보처리방침의 변경</h2>
          <p>
            이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경 내용의 추가·삭제·정정이 있는
            경우에는 변경 사항의 시행 전에 공지를 통하여 고지할 것입니다.
          </p>
        </section>

        <p className="text-body text-muted-foreground pt-4 border-t border-border">
          최초 시행일: 2026년 3월 1일 | 최종 개정일: 2026년 6월 14일
        </p>
      </div>
    </div>
  )
}
