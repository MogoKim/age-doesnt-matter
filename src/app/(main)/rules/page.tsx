import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '커뮤니티 이용규칙',
}

export default function RulesPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8">커뮤니티 이용규칙</h1>

      <div className="prose-senior space-y-8 text-body text-foreground leading-[1.85] break-keep">
        <p className="text-lg text-muted-foreground">
          우리 나이가 어때서는 5060 세대가 서로 존중하며 소통하는 따뜻한 커뮤니티입니다.
          아래 규칙을 지켜주시면 모두가 즐거운 공간이 됩니다.
        </p>

        <section>
          <h2 className="text-lg font-bold mb-3">1. 서로 존중해요</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>욕설, 비방, 인신공격은 금지됩니다.</li>
            <li>나이, 성별, 지역 등을 이유로 한 차별적 표현은 삼가해 주세요.</li>
            <li>상대방의 의견이 다르더라도 정중하게 대화해 주세요.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">2. 정치·종교 이야기는 자제해요</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>특정 정당이나 정치인을 지지·비방하는 글은 삭제될 수 있습니다.</li>
            <li>종교 포교 목적의 글은 자제해 주세요.</li>
            <li>사회 이슈에 대한 건전한 토론은 환영하지만, 과도한 갈등 조장은 금지됩니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">3. 광고·홍보는 정해진 곳에서만</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>일반 게시판에 상업적 광고를 올리면 삭제됩니다.</li>
            <li>동일한 내용을 여러 게시판에 반복 게시하는 것은 금지됩니다.</li>
            <li>허위·과장 광고는 즉시 삭제되며 이용이 제한될 수 있습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">4. 개인정보를 보호해요</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>본인 또는 타인의 전화번호, 주소, 계좌번호 등 개인정보를 게시하지 마세요.</li>
            <li>동의 없이 타인의 사진이나 영상을 공유하지 마세요.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">5. 허위 정보를 퍼뜨리지 않아요</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>확인되지 않은 건강·의료 정보를 사실처럼 작성하지 마세요.</li>
            <li>가짜 뉴스나 허위 사실 유포는 금지됩니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">6. 성인·혐오 콘텐츠는 금지</h2>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>음란물, 선정적 콘텐츠는 즉시 삭제되며 영구 이용정지됩니다.</li>
            <li>폭력적이거나 잔인한 이미지·영상은 금지됩니다.</li>
          </ul>
        </section>

        <section className="bg-primary/5 rounded-2xl p-6 border border-primary/20">
          <h2 className="text-lg font-bold mb-3">제재 기준</h2>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>1차 위반:</strong> 해당 글·댓글 삭제 + 경고</li>
            <li><strong>2차 위반:</strong> 7일 글쓰기 제한</li>
            <li><strong>3차 위반:</strong> 30일 이용 정지</li>
            <li><strong>중대 위반:</strong> 즉시 영구 이용정지 (음란물, 사기 등)</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">
            신고가 3건 이상 접수된 글은 자동으로 숨김 처리되며, 운영진이 검토합니다.
          </p>
        </section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          시행일: 2026년 3월 1일 · 우리 나이가 어때서 운영팀
        </p>
      </div>
    </div>
  )
}
