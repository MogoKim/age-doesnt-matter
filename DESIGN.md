# 우나어 디자인 시스템 (Design System Specification)

> Machine-readable design spec for AI tools (Stitch AI, Claude Code, Figma MCP).
> Source of truth: code (`globals.css`, `tailwind.config.ts`, `src/components/ui/`).
> Last updated: 2026-03-24

---

## 1. Identity

| Key | Value |
|-----|-------|
| **Service** | 우리 나이가 어때서 (우나어) |
| **Domain** | age-doesnt-matter.com |
| **Language** | Korean (ko) |
| **Target** | Adults 50-60+, Korean |
| **Personality** | Warm, approachable, trustworthy, simple |
| **Dark mode** | Not supported |

---

## 2. Colors

CSS variables defined in `src/app/globals.css` using HSL format.

### Core Palette

| Token | HSL | HEX | Usage |
|-------|-----|-----|-------|
| `--background` | 210 17% 98% | #F8F9FA | Page background (warm gray) |
| `--foreground` | 222 47% 11% | #111827 | Primary text (charcoal) |
| `--card` | 0 0% 100% | #FFFFFF | Card/surface |
| `--card-foreground` | 222 47% 11% | #111827 | Card text |
| `--primary` | 5 100% 69% | #FF6F61 | Brand coral (buttons/fills) |
| `--primary-foreground` | 0 0% 100% | #FFFFFF | Text on primary |
| `--primary-text` | 5 55% 50% | #C4453B | Accessible text coral (WCAG AA 4.93:1) |
| `--secondary` | 220 14% 96% | #F1F3F5 | Neutral background |
| `--secondary-foreground` | 222 47% 11% | #111827 | Text on secondary |
| `--muted` | 220 14% 96% | #F1F3F5 | Disabled/hint background |
| `--muted-foreground` | 220 9% 46% | #6B7280 | Hint text |
| `--accent` | 220 14% 96% | #F1F3F5 | Hover highlight |
| `--accent-foreground` | 222 47% 11% | #111827 | Text on accent |
| `--destructive` | 4 90% 58% | #F44336 | Error/delete |
| `--destructive-foreground` | 0 0% 100% | #FFFFFF | Text on destructive |
| `--border` | 220 13% 91% | #E5E7EB | Dividers/borders |
| `--input` | 220 13% 91% | #E5E7EB | Input borders |
| `--ring` | 5 100% 69% | #FF6F61 | Focus ring |

### Usage Rules

- **Brand color on backgrounds**: Use `--primary` (#FF6F61)
- **Brand color as text**: Use `--primary-text` (#C4453B) for WCAG AA compliance
- **No dark mode**: Only one theme (light)

---

## 3. Typography

Font: **Pretendard Variable** (loaded via `next/font/local`)

### Scale (defined in `tailwind.config.ts`)

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-xs` | 15px | 1.4 | Captions, badges (minimum allowed) |
| `text-sm` | 16px | 1.5 | Secondary text, labels |
| `text-base` | 18px | 1.6 | Body text (default) |
| `text-lg` | 20px | 1.6 | Subheadings |
| `text-xl` | 24px | 1.4 | Section titles |
| `text-2xl` | 28px | 1.3 | Page headings |
| `text-3xl` | 36px | 1.2 | Hero text |
| `text-4xl` | 44px | 1.2 | Display (rarely used) |

### Body Defaults

- `font-size`: `var(--font-body, 16px)` (dynamically adjustable via FontSizeProvider)
- `line-height`: 1.75
- `font-weight`: 400
- `word-break`: keep-all (Korean text)
- `-webkit-font-smoothing`: antialiased

---

## 4. Spacing & Layout

### Base Unit

4px grid. Common values: 4, 8, 12, 16, 24, 32px.

### Border Radius

| Token | Value |
|-------|-------|
| `--radius` (base) | 0.75rem (12px) |
| `rounded-sm` | calc(0.75rem - 4px) = 8px |
| `rounded-md` | calc(0.75rem - 2px) = 10px |
| `rounded-lg` | 0.75rem = 12px |
| `rounded-xl` | 16px (cards) |
| `rounded-2xl` | 20px (modals) |
| `rounded-full` | 9999px (pills, avatars) |

### Container

- Max width: **1200px** (center aligned, `padding: 2rem`)
- Content area: `max-w-[720px]` for reading (post detail)

### Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile (default) | 0-767px | Single column, Header + IconMenu |
| Tablet | 768-1023px | 2 columns |
| Desktop (lg:) | 1024px+ | 3 columns + sidebar, GNB |

---

## 5. Senior-Friendly Constraints (NON-NEGOTIABLE)

These rules MUST be enforced on every screen. AI tools must validate output against this table.

| Rule | Selector | Property | Mobile | Desktop (lg:) |
|------|----------|----------|--------|---------------|
| TOUCH_TARGET | `button, a, input, select, textarea` | min-height | 52px | 48px |
| BUTTON_HEIGHT | Button default | height | 52px | 48px (h-12) |
| BUTTON_WIDTH | Button default | width | 100% | auto, min-w-[120px] |
| INPUT_HEIGHT | Input, select, textarea | height | 52px | 52px |
| CHIP_HEIGHT | Chip | min-height | 52px | 48px |
| ICON_BUTTON | Button icon variant | size | 52x52px | 48x48px |
| FONT_MIN | All text | font-size | >= 15px | >= 15px |
| FONT_BODY | Body text | font-size | 18px base | 18px base |
| LINE_HEIGHT | Body | line-height | 1.75 | 1.75 |
| COLOR_CONTRAST | Text on bg | ratio | >= 4.5:1 | >= 4.5:1 (WCAG AA) |
| WORD_BREAK | All Korean text | word-break | keep-all | keep-all |
| SCROLLBAR | Custom | width | 6px | 6px |
| GLOBAL_MIN_TOUCH | CSS reset | min-height | 44px | 44px |

---

## 6. Component Inventory

All components in `src/components/ui/`. Use `cn()` from `@/lib/utils` (clsx + tailwind-merge).

### Button (`Button.tsx`)

CVA-based. `asChild` via Radix Slot. `isLoading` shows spinner.

| Variant | Style |
|---------|-------|
| `default` | coral bg, white text, shadow, hover 90%, active scale 0.98 |
| `destructive` | red bg, white text |
| `outline` | coral border, coral text, transparent bg |
| `secondary` | gray bg, dark text |
| `ghost` | transparent, muted text, hover gray bg |
| `link` | coral text, underline on hover |

| Size | Height | Width | Notes |
|------|--------|-------|-------|
| `default` | 52px / lg:48px | full / lg:auto min-120px | Standard CTA |
| `sm` | 40px | auto | Compact |
| `lg` | 56px | auto | Large CTA |
| `icon` | 52x52px / lg:48x48px | square | Icon-only |

### Card (`Card.tsx`)

Compound: `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`.
- Style: `rounded-xl border bg-card shadow`
- Header padding: `p-6`
- Content padding: `p-6 pt-0`

### Input (`Input.tsx`)

- Height: `52px`
- Style: `rounded-lg border bg-background px-4 text-base shadow-sm`
- States: default, error (red border + message), success (green message)
- Optional `label` prop
- Focus: `ring-2 ring-ring`

### Badge (`Badge.tsx`)

| Variant | Style |
|---------|-------|
| `default` | coral bg, white text |
| `secondary` | gray bg, dark text |
| `destructive` | red bg, white text |
| `outline` | border only, dark text |

- Size: `px-2.5 py-0.5 text-xs rounded-md`

### Chip (`Chip.tsx`)

Toggle button. `active` prop controls state.
- Height: `min-h-[52px]` / lg: `min-h-[48px]`
- Style: `rounded-full border px-4 text-xs`
- Active: coral border + bg, coral text
- Inactive: gray border, muted text

### Skeleton (`Skeleton.tsx`)

- Style: `animate-pulse rounded-md bg-primary/10`

### Toast (`Toast.tsx`)

Context-based (`ToastProvider` + `useToast`).
- Position: fixed top-20, center
- Style: `bg-card border rounded-xl shadow-md px-6 py-4`
- Animation: slide-in-from-top / slide-out-to-top

### BottomSheet (`BottomSheet.tsx`)

Wraps `Sheet` (Radix). Responsive behavior:
- **Mobile**: bottom sheet, `rounded-t-2xl`, max 85vh, drag handle
- **Desktop (lg:)**: centered modal, `rounded-2xl`, max-w-480px

### EmptyState (`EmptyState.tsx`)

- Emoji icon (5xl) + message (lg bold) + sub text (sm muted) + action slot
- Centered, `py-12 px-4`

### AlertDialog (`alert-dialog.tsx`)

Radix UI AlertDialog. Overlay + centered content.
- Style: `rounded-lg border bg-background p-6 shadow-lg`
- Responsive: max-w-lg

### ConfirmDialog (`ConfirmDialog.tsx`)

Custom wrapper over AlertDialog for simple confirm/cancel flows.

### Sheet (`sheet.tsx`)

Radix Dialog-based side panel. Supports `top/bottom/left/right` sides.
- Overlay: `bg-black/80`
- Transition: slide in/out with `data-[state]` animations

---

## 7. Layout Structure

### Mobile (< 1024px)

```
┌─────────────────────────────┐
│ Header (56px, sticky)       │ ← Logo + Search + Profile (52px icons)
├─────────────────────────────┤
│ IconMenu (64px, sticky)     │ ← 5 nav icons (52px each)
├─────────────────────────────┤
│                             │
│  main#main-content          │ ← Page content
│                             │
├─────────────────────────────┤
│ Footer                      │
└─────────────────────────────┘
        [FAB] ← Floating bottom-right (coral, 글쓰기)
```

**Navigation icons**: ⭐ 베스트 | 💼 내 일 찾기 | 💬 사는 이야기 | ⚡ 활력 충전소 | 📖 매거진

### Desktop (>= 1024px)

```
┌───────────────────────────────────────────────┐
│ GNB (64px, sticky)                            │ ← Logo + Nav links + Search + Auth
├───────────────────────────────────────────────┤
│                                               │
│  main#main-content (max-1200px centered)      │
│  ┌──────────────────┐ ┌──────────┐           │
│  │ Content (flex-1)  │ │ Sidebar  │           │
│  │                   │ │ (300px)  │           │
│  └──────────────────┘ └──────────┘           │
│                                               │
├───────────────────────────────────────────────┤
│ Footer                                        │
└───────────────────────────────────────────────┘
```

### Admin Layout

Separate from main. `AdminHeader` + `AdminSidebar` (left) + content area.
- Sidebar: collapsible, nav links for dashboard/content/members/reports/banners/analytics/settings
- No Header/IconMenu/GNB/FAB/Footer from main layout

### Wrapper Component

`MainLayout.tsx` wraps all user pages:
- Skip navigation link (sr-only, accessible)
- Header + IconMenu (mobile)
- GNB (desktop)
- `<main id="main-content">`
- FAB (conditional on login)
- Footer

---

## 8. Page Inventory

### User Pages (22)

| Route | Name | Key Elements |
|-------|------|-------------|
| `/` | Home | HeroSlider, Identity, JobSection, TrendingSection, EditorsPickSection, MagazineSection, CommunitySection, HomeSidebar (desktop) |
| `/best` | Best Posts | SortToggle (recent/likes), PostCard list, tabs (HOT/HALL_OF_FAME) |
| `/jobs` | Jobs | JobFilterButton, JobQuickTags, JobFilterPanel, job cards |
| `/jobs/[id]` | Job Detail | Company info, pickPoints, salary, tags, ActionBar |
| `/community/[boardSlug]` | Board | BoardFilter, SortToggle, PostCard list, LoadMoreButton |
| `/community/[slug]/[postId]` | Post Detail | Title, author, content (sanitized HTML), ActionBar, CommentSection |
| `/community/[slug]/[postId]/edit` | Post Edit | TipTapEditor, category select |
| `/community/write` | Write Post | TipTapEditor, board/category select, image upload |
| `/magazine` | Magazine | Category filter, magazine card grid |
| `/magazine/[id]` | Magazine Detail | Full article, ActionBar |
| `/search` | Search | SearchForm, SearchTabs (posts/jobs/magazine), SearchResults |
| `/my` | My Page | Profile card, menu links (posts/comments/scraps/settings) |
| `/my/posts` | My Posts | PostCard list |
| `/my/comments` | My Comments | Comment list |
| `/my/scraps` | My Scraps | Scrapped post list |
| `/my/notifications` | Notifications | Notification list, MarkAllReadButton |
| `/my/settings` | Settings | FontSizeSettings, NicknameSettings, PrivacySettings, BlockedUserList, WithdrawSection |
| `/login` | Login | KakaoLoginButton (52px+ CTA) |
| `/onboarding` | Onboarding | Step form (nickname, interests) |
| `/about` | About | Service description |
| `/faq` | FAQ | Accordion Q&A |
| `/terms`, `/privacy`, `/rules`, `/contact` | Legal/Info | Static content |

### Admin Pages (8)

| Route | Name | Key Elements |
|-------|------|-------------|
| `/admin/login` | Admin Login | Email/password form |
| `/admin` | Dashboard | Stats cards, charts, recent activity |
| `/admin/content` | Content Mgmt | ContentTable, search, filters |
| `/admin/members` | Members | MemberTable, grade badges |
| `/admin/reports` | Reports | ReportTable, action buttons |
| `/admin/banners` | Banners | AdBannerTable, BannerManager |
| `/admin/analytics` | Analytics | Event logs, page views, charts |
| `/admin/settings` | Settings | BoardConfigPanel, BannedWordPanel |

---

## 9. Stitch AI Prompt Template

When generating screens in Stitch, use this template:

```
[Screen type] for 우나어 (Korean community for adults 50+).

Device: [Mobile 375px / Desktop 1280px]
Route: [/path]

Design rules:
- Brand: coral #FF6F61 primary, #F8F9FA background, #FFFFFF cards
- Font: Pretendard Variable, 18px base body, minimum 15px
- Touch targets: minimum [52px mobile / 48px desktop]
- Border radius: 12px cards (rounded-xl), 8px buttons (rounded-lg)
- Line height: 1.75 body text
- Korean text: word-break keep-all

Layout: [Describe specific layout for this screen]
Content: [Describe sections/components]
```

---

## 10. Ad Slots

Every ad placement must include a visible "광고" label.
- Style: `bg-[#F9F5F0] rounded-2xl px-4 py-8 text-center border border-dashed border-border`
- Label: `absolute top-2 left-2 text-[13px] bg-white/90 px-2 py-0.5 rounded-full`
