import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관',
}

export default function TermsPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8">이용약관</h1>

      <div className="prose-senior space-y-8 text-body text-foreground leading-[1.85] break-keep">
        <section>
          <h2 className="text-lg font-bold mb-3">제1조 (목적)</h2>
          <p>
            이 약관은 우리 나이가 어때서(이하 &ldquo;우나어&rdquo;)가 제공하는 서비스의 이용 조건 및
            절차, 이용자와 우나어의 권리·의무 및 책임사항 등을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제2조 (정의)</h2>
          <p>
            ① &ldquo;서비스&rdquo;라 함은 우나어가 제공하는 커뮤니티, 일자리 정보, 매거진 등
            모든 관련 서비스를 의미합니다.
          </p>
          <p>
            ② &ldquo;이용자&rdquo;라 함은 이 약관에 따라 서비스를 이용하는 자를 말합니다.
          </p>
          <p>
            ③ &ldquo;회원&rdquo;이라 함은 카카오 계정을 통해 가입하여 서비스를 이용하는 자를 말합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제3조 (약관의 효력 및 변경)</h2>
          <p>
            ① 이 약관은 서비스를 이용하고자 하는 모든 회원에게 적용됩니다.
          </p>
          <p>
            ② 우나어는 필요한 경우 관련 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며,
            변경 시 적용일자 7일 전 서비스 내 공지합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제4조 (회원가입 및 탈퇴)</h2>
          <p>
            ① 회원가입은 카카오 계정을 통해 이루어지며, 서비스 이용약관 및 개인정보 처리방침에
            동의하여야 합니다.
          </p>
          <p>
            ② 회원은 언제든지 마이페이지에서 탈퇴를 요청할 수 있으며, 탈퇴 후 30일간 데이터가
            보관된 후 삭제됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제5조 (서비스의 제공)</h2>
          <p>
            우나어는 다음의 서비스를 제공합니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>커뮤니티 서비스 (글 작성, 댓글, 공감)</li>
            <li>일자리 정보 제공 서비스</li>
            <li>매거진 콘텐츠 서비스</li>
            <li>기타 우나어가 정하는 서비스</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제6조 (이용자의 의무)</h2>
          <p>
            이용자는 다음 행위를 하여서는 안 됩니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>타인의 정보를 부정하게 사용하는 행위</li>
            <li>서비스 운영을 방해하는 행위</li>
            <li>욕설, 비방, 혐오 표현 등 커뮤니티 규칙에 위배되는 행위</li>
            <li>상업적 광고·스팸을 게시하는 행위</li>
            <li>기타 법령에 위배되는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">제7조 (면책)</h2>
          <p>
            ① 우나어는 천재지변 등 불가항력적 사유로 서비스를 제공할 수 없는 경우 책임을 면합니다.
          </p>
          <p>
            ② 이용자가 게시한 콘텐츠로 인한 법적 책임은 해당 이용자에게 있습니다.
          </p>
        </section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          시행일: 2026년 3월 1일
        </p>
      </div>
    </div>
  )
}
