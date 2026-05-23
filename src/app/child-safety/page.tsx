import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '아동 안전 표준 | 우리 나이가 어때서',
  description: '우리 나이가 어때서 앱의 아동 안전 표준 정책',
}

export default function ChildSafetyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">아동 안전 표준</h1>
      <p className="text-sm text-gray-500 mb-8">
        앱: 우리 나이가 어때서 · 개발자: mogo_Kim · 최종 수정: 2026-05-23
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">1. 적용 범위</h2>
        <p className="text-gray-700 leading-relaxed">
          본 표준은 우리 나이가 어때서(com.agenotmatter.app) 앱 및
          age-doesnt-matter.com 웹사이트에 적용됩니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">2. 아동 성적 학대 및 착취(CSAE) 금지</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          우리 나이가 어때서는 아동 성적 학대 및 착취(Child Sexual Abuse and
          Exploitation, CSAE)를 명시적으로 금지하며 절대 용납하지 않습니다.
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li>아동 성적 학대물(CSAM) 생성·배포·소지 행위 금지</li>
          <li>아동을 대상으로 한 성적 착취 또는 그루밍 행위 금지</li>
          <li>아동 안전을 위협하는 콘텐츠 게시 금지</li>
          <li>아동에게 유해한 모든 형태의 접촉 또는 관계 유도 금지</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">3. 서비스 특성</h2>
        <p className="text-gray-700 leading-relaxed">
          우리 나이가 어때서는 50대·60대 성인을 위한 커뮤니티 서비스입니다.
          아동이 사용 대상이 아니며, 회원가입 시 성인 인증(카카오 계정)을 통해
          미성년자 접근을 제한합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">4. 신고 및 대응</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          아동 안전 관련 문제를 발견하신 경우 즉시 신고해 주시기 바랍니다.
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li>이메일: korea.age.not.matter@gmail.com</li>
          <li>신고 접수 후 24시간 이내 검토 및 조치</li>
          <li>필요 시 수사기관 협조</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">5. 관련 법령 준수</h2>
        <p className="text-gray-700 leading-relaxed">
          본 서비스는 아동·청소년의 성보호에 관한 법률, Google Play 아동 안전 표준 정책,
          및 관련 국내외 법령을 준수합니다.
        </p>
      </section>

      <p className="text-xs text-gray-400 border-t pt-6">
        우리 나이가 어때서 · mogo_Kim · korea.age.not.matter@gmail.com
      </p>
    </main>
  )
}
