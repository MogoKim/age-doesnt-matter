import type { Metadata } from 'next'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

export const metadata: Metadata = {
  title: '우나어 — 컴포넌트 쇼케이스',
  description: 'Design system component showcase for Stitch AI',
  robots: 'noindex, nofollow',
}

/* ── Color Swatch ── */
function Swatch({ name, hsl, hex }: { name: string; hsl: string; hex: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-lg border border-border shrink-0" style={{ backgroundColor: hex }} />
      <div>
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{hex} · {hsl}</p>
      </div>
    </div>
  )
}

/* ── Section Wrapper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold text-foreground mb-6 pb-2 border-b border-border">{title}</h2>
      {children}
    </section>
  )
}

export default function ComponentShowcasePage() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8 md:px-6">
      <header className="mb-12">
        <h1 className="text-2xl font-bold text-foreground mb-2">우나어 디자인 시스템</h1>
        <p className="text-base text-muted-foreground">
          컴포넌트 쇼케이스 — 시니어 친화 UI (52px 터치 타겟, 18px 본문, #FF6F61 브랜드)
        </p>
      </header>

      {/* ── 1. Colors ── */}
      <Section title="1. Colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Swatch name="Primary (Coral)" hsl="5 100% 69%" hex="#FF6F61" />
          <Swatch name="Primary Text (AA)" hsl="5 55% 50%" hex="#C4453B" />
          <Swatch name="Background" hsl="210 17% 98%" hex="#F8F9FA" />
          <Swatch name="Foreground" hsl="222 47% 11%" hex="#111827" />
          <Swatch name="Card" hsl="0 0% 100%" hex="#FFFFFF" />
          <Swatch name="Border" hsl="220 13% 91%" hex="#E5E7EB" />
          <Swatch name="Muted Foreground" hsl="220 9% 46%" hex="#6B7280" />
          <Swatch name="Destructive" hsl="4 90% 58%" hex="#F44336" />
          <Swatch name="Secondary" hsl="220 14% 96%" hex="#F1F3F5" />
        </div>
      </Section>

      {/* ── 2. Typography ── */}
      <Section title="2. Typography (Pretendard Variable)">
        <div className="space-y-4 bg-card rounded-xl border p-6">
          <p className="text-4xl font-bold">text-4xl · 44px · Display</p>
          <p className="text-3xl font-bold">text-3xl · 36px · Hero</p>
          <p className="text-2xl font-bold">text-2xl · 28px · Page Heading</p>
          <p className="text-xl font-bold">text-xl · 24px · Section Title</p>
          <p className="text-lg font-semibold">text-lg · 20px · Subheading</p>
          <p className="text-base">text-base · 18px · Body (default)</p>
          <p className="text-sm">text-sm · 16px · Secondary</p>
          <p className="text-xs text-muted-foreground">text-xs · 15px · Caption (minimum)</p>
        </div>
      </Section>

      {/* ── 3. Buttons ── */}
      <Section title="3. Button">
        <div className="space-y-6">
          {/* Variants */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Variants</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default" size="sm">Default</Button>
              <Button variant="destructive" size="sm">Destructive</Button>
              <Button variant="outline" size="sm">Outline</Button>
              <Button variant="secondary" size="sm">Secondary</Button>
              <Button variant="ghost" size="sm">Ghost</Button>
              <Button variant="link" size="sm">Link</Button>
            </div>
          </div>

          {/* Sizes */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Sizes (52px mobile / 48px desktop)</h3>
            <div className="space-y-3 max-w-md">
              <Button size="sm">Small (40px)</Button>
              <Button size="default">Default (52px / 48px)</Button>
              <Button size="lg">Large (56px)</Button>
            </div>
            <div className="flex gap-3 mt-3">
              <Button size="icon" variant="outline" aria-label="Icon button">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </Button>
              <Button size="icon" aria-label="Icon button default">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </Button>
            </div>
          </div>

          {/* States */}
          <div>
            <h3 className="text-lg font-semibold mb-3">States</h3>
            <div className="flex flex-wrap gap-3">
              <Button size="sm">Normal</Button>
              <Button size="sm" disabled>Disabled</Button>
              <Button size="sm" isLoading>Loading</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 4. Badge ── */}
      <Section title="4. Badge">
        <div className="flex flex-wrap gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      {/* ── 5. Card ── */}
      <Section title="5. Card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>카드 제목</CardTitle>
              <CardDescription>카드 설명 텍스트 — 보조 정보 표시</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-base">카드 본문 내용입니다. 18px 기본 폰트 크기로 시니어 분들이 읽기 편합니다.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">자세히 보기</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge>HOT</Badge>
                <CardTitle>인기 게시글 카드</CardTitle>
              </div>
              <CardDescription>작성자 · 2시간 전 · 👁 128</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-base">커뮤니티 게시글 카드 예시입니다. 다양한 콘텐츠 유형에 사용됩니다.</p>
            </CardContent>
            <CardFooter className="gap-4 text-sm text-muted-foreground">
              <span>❤️ 42</span>
              <span>💬 12</span>
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* ── 6. Input ── */}
      <Section title="6. Input (52px height)">
        <div className="max-w-md space-y-4">
          <Input label="닉네임" placeholder="2-10자 한글/영문" />
          <Input label="이메일" type="email" placeholder="example@email.com" error="올바른 이메일 형식이 아닙니다" />
          <Input label="인증 완료" placeholder="인증됨" success="인증이 완료되었습니다" disabled />
        </div>
      </Section>

      {/* ── 7. Chip ── */}
      <Section title="7. Chip (52px / 48px touch target)">
        <div className="flex flex-wrap gap-2">
          <ChipDemo label="전체" active />
          <ChipDemo label="건강/운동" />
          <ChipDemo label="요리/맛집" />
          <ChipDemo label="여행" />
          <ChipDemo label="원예/텃밭" />
          <ChipDemo label="반려동물" />
        </div>
      </Section>

      {/* ── 8. Skeleton ── */}
      <Section title="8. Skeleton (Loading)">
        <div className="space-y-3 max-w-md">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 9. EmptyState ── */}
      <Section title="9. EmptyState">
        <div className="bg-card rounded-xl border">
          <EmptyState
            icon="📭"
            message="아직 작성한 글이 없어요"
            sub="첫 번째 이야기를 들려주세요!"
          >
            <Button size="sm">글 쓰러 가기</Button>
          </EmptyState>
        </div>
      </Section>

      {/* ── 10. Spacing & Radius ── */}
      <Section title="10. Spacing & Border Radius">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Border Radius</h3>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-sm" />
                <p className="text-xs mt-1">sm (8px)</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-md" />
                <p className="text-xs mt-1">md (10px)</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-lg" />
                <p className="text-xs mt-1">lg (12px)</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-xl" />
                <p className="text-xs mt-1">xl (16px)</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-2xl" />
                <p className="text-xs mt-1">2xl (20px)</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/20 border border-primary rounded-full" />
                <p className="text-xs mt-1">full</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Spacing Scale (4px base)</h3>
            <div className="space-y-2">
              {[4, 8, 12, 16, 24, 32, 48, 64].map((px) => (
                <div key={px} className="flex items-center gap-3">
                  <div className="bg-primary/30 rounded" style={{ width: px, height: 16 }} />
                  <span className="text-xs text-muted-foreground">{px}px</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 11. Ad Slot ── */}
      <Section title="11. Ad Slot">
        <div className="bg-[#F9F5F0] rounded-2xl px-4 py-8 text-center relative border border-dashed border-border text-muted-foreground text-xs">
          <span className="absolute top-2 left-2 text-caption text-muted-foreground bg-white/90 px-2 py-0.5 rounded-full font-medium">
            광고
          </span>
          광고 영역 — 모든 광고 슬롯에 &quot;광고&quot; 라벨 필수
        </div>
      </Section>

      {/* ── 12. Touch Target Reference ── */}
      <Section title="12. Touch Target (52px minimum)">
        <div className="bg-card rounded-xl border p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            모든 인터랙티브 요소는 최소 52px (모바일) / 48px (데스크탑) 터치 타겟을 보장합니다.
          </p>
          <div className="flex items-end gap-4">
            <div className="text-center">
              <div className="w-[52px] h-[52px] bg-primary rounded-lg flex items-center justify-center text-white text-xs font-bold">
                52px
              </div>
              <p className="text-xs mt-1">Mobile</p>
            </div>
            <div className="text-center">
              <div className="w-[48px] h-[48px] bg-primary/80 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                48px
              </div>
              <p className="text-xs mt-1">Desktop</p>
            </div>
            <div className="text-center">
              <div className="w-[44px] h-[44px] bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs font-bold border">
                44px
              </div>
              <p className="text-xs mt-1">Global min</p>
            </div>
          </div>
        </div>
      </Section>

      <footer className="mt-16 py-8 border-t border-border text-center text-xs text-muted-foreground">
        우나어 디자인 시스템 v1.0 — Stitch AI / Claude Code / Figma MCP 연동용
      </footer>
    </div>
  )
}

/* ── Chip Demo (static, no client interactivity needed) ── */
function ChipDemo({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-h-[52px] px-4 text-xs rounded-full border whitespace-nowrap select-none lg:min-h-[48px] ${
        active
          ? 'border-primary bg-primary/5 text-primary font-medium'
          : 'border-border bg-background text-muted-foreground'
      }`}
    >
      {label}
    </span>
  )
}
