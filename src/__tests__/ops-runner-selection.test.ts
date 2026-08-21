import { describe, expect, it } from 'vitest'
import {
  LAUNCHD_RUNNERS,
  OPERATIONAL_LABEL_PREFIXES,
  isMonitoredLaunchdFile,
  launchdLabelFromFile,
  pathInRoot,
  pathRoot,
  type RootDirs,
} from '../../scripts/ops-runner-manifest'

/**
 * P0-1B 후속 — **검사 대상 선정**과 **경로 분류** 회귀 테스트 (코드 리뷰 2026-08-21).
 *
 * 이 파일이 따로 필요한 이유:
 *   ops-runner-freshness.test.ts 33개는 전부 `judgeRunnerFreshness` 한 함수만 겨냥한다.
 *   그런데 실제 구멍은 그 함수 **바깥**에 있었다 —
 *   "애초에 검사 대상에 들어오지도 못한" 잡이 있었고(BLOCKER-1),
 *   판정이 아무리 정확해도 입력이 안 들어오면 아무것도 잡지 못한다.
 *
 *   판정 로직만 테스트하면 "guard가 검증됐다"는 착각이 생긴다.
 *   선정 로직도 순수 함수여야 하고, 그래서 여기서 따로 고정한다.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. BLOCKER-1 재현 — com.unaeo.* 가 검사에서 통째로 빠졌다
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('BLOCKER-1 재현 — launchd 검사 대상 선정', () => {
  it('com.unaeo.magazine-morning.plist 가 검사 대상이다 (publish 등급)', () => {
    // 🔴 예전 필터 `startsWith('com.unao.')` 는 이걸 걸러냈다.
    //    'com.unao' 뒤에 리터럴 점을 요구하는데 실제는 'com.unaeo.' 라서 안 걸린다.
    //    고객 화면에 글을 내보내는 publish runner가 한 번도 검사되지 않았다.
    expect('com.unaeo.magazine-morning'.startsWith('com.unao.')).toBe(false)
    expect(isMonitoredLaunchdFile('com.unaeo.magazine-morning.plist')).toBe(true)
  })

  it('com.unaeo.magazine-late · session-refresh 도 검사 대상이다', () => {
    expect(isMonitoredLaunchdFile('com.unaeo.magazine-late.plist')).toBe(true)
    expect(isMonitoredLaunchdFile('com.unaeo.session-refresh.plist')).toBe(true)
  })

  it('등급표에 있는 label은 하나도 빠짐없이 검사 대상이다', () => {
    // 이 단언이 핵심이다. 등급표에 이름을 올려두고 검사에서 빠지면
    // "검사되고 있다"는 착각만 만든다 — O1과 같은 실패 구조다.
    for (const label of Object.keys(LAUNCHD_RUNNERS)) {
      expect(isMonitoredLaunchdFile(`${label}.plist`), `${label} 이 검사 대상이 아니다`).toBe(true)
    }
  })

  it('세 갈래 prefix가 모두 등록돼 있다 — 실제 label 체계가 unao/unaeo/unaoeo 3종이다', () => {
    const prefixes = new Set(
      Object.keys(LAUNCHD_RUNNERS).map((l) => `${l.split('.').slice(0, 2).join('.')}.`),
    )
    for (const p of prefixes) {
      expect(OPERATIONAL_LABEL_PREFIXES, `${p} 가 운영 prefix 목록에 없다`).toContain(p)
    }
  })

  it('등급표에 없어도 운영 prefix면 검사 대상이다 — 새 잡이 조용히 새지 않게', () => {
    expect(isMonitoredLaunchdFile('com.unao.brand-new-publisher.plist')).toBe(true)
    expect(isMonitoredLaunchdFile('com.unaeo.some-new-job.plist')).toBe(true)
  })

  it('.plist 가 아니면 제외한다 — launchd가 로드하지 않는 백업본', () => {
    // 실제로 ~/Library/LaunchAgents 에 있는 파일이다. 검사 대상이면 오탐이 된다.
    expect(isMonitoredLaunchdFile('com.unao.naver-cafe-sheet-scraper.plist.bak-20260820')).toBe(false)
  })

  it('무관한 서드파티 plist는 제외한다', () => {
    expect(isMonitoredLaunchdFile('com.apple.something.plist')).toBe(false)
    expect(isMonitoredLaunchdFile('homebrew.mxcl.postgresql.plist')).toBe(false)
  })

  it('label 추출은 .plist 만 떼어낸다', () => {
    expect(launchdLabelFromFile('com.unaeo.magazine-late.plist')).toBe('com.unaeo.magazine-late')
    expect(launchdLabelFromFile('com.unao.cafe-crawler-dawn.plist')).toBe('com.unao.cafe-crawler-dawn')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. 경로 분류 — prefix 매칭 경계
 * ═══════════════════════════════════════════════════════════════════════════ */

const DIRS: RootDirs = {
  prod: '/Users/yanadoo/Documents/unao-prod',
  ops: '/Users/yanadoo/Documents/unao-ops',
  DEV: '/Users/yanadoo/Documents/New_Claude_agenotmatter',
  main: '/Users/yanadoo/Documents/unao-main',
}

describe('경로 → 실행 루트 분류', () => {
  it('루트 자기 자신과 하위 경로를 인식한다', () => {
    expect(pathRoot('/Users/yanadoo/Documents/unao-prod', DIRS)).toBe('prod')
    expect(pathRoot('/Users/yanadoo/Documents/unao-prod/scripts/x.sh', DIRS)).toBe('prod')
    expect(pathRoot('/Users/yanadoo/Documents/unao-ops/agents/y.ts', DIRS)).toBe('ops')
    expect(pathRoot('/Users/yanadoo/Documents/New_Claude_agenotmatter/z', DIRS)).toBe('DEV')
    expect(pathRoot('/Users/yanadoo/Documents/unao-main/scripts/a.ts', DIRS)).toBe('main')
  })

  it('형제 디렉터리를 루트로 오분류하지 않는다', () => {
    // 🔴 `startsWith(root)` 단독이면 여기가 'prod'로 분류된다.
    //    그러면 자동 sync가 없는 디렉터리가 sync 유예 48h 특권을 얻고,
    //    stale이 FATAL 대신 WARN이 된다 — O1이 통과했던 완화 경로와 같은 성격이다.
    expect(pathRoot('/Users/yanadoo/Documents/unao-prod-backup/x', DIRS)).toBe('other')
    expect(pathRoot('/Users/yanadoo/Documents/unao-prod2', DIRS)).toBe('other')
    expect(pathRoot('/Users/yanadoo/Documents/unao-ops-archive', DIRS)).toBe('other')
    expect(pathRoot('/Users/yanadoo/Documents/unao-main-old', DIRS)).toBe('other')
  })

  it('null·빈 문자열은 미지정(-)이다', () => {
    expect(pathRoot(null, DIRS)).toBe('-')
    expect(pathRoot(undefined, DIRS)).toBe('-')
    expect(pathRoot('', DIRS)).toBe('-')
  })

  it('알 수 없는 경로는 other다', () => {
    expect(pathRoot('/usr/local/bin/node', DIRS)).toBe('other')
    expect(pathRoot('/Users/yanadoo/Documents/전혀-다른-폴더', DIRS)).toBe('other')
  })

  it('pathInRoot는 경계를 정확히 본다', () => {
    expect(pathInRoot('/a/b', '/a/b')).toBe(true)
    expect(pathInRoot('/a/b/c', '/a/b')).toBe(true)
    expect(pathInRoot('/a/bc', '/a/b')).toBe(false)
    expect(pathInRoot('/a/b-2', '/a/b')).toBe(false)
    // 루트에 이미 슬래시가 붙어 있어도 이중 슬래시를 만들지 않는다
    expect(pathInRoot('/a/b/c', '/a/b/')).toBe(true)
  })
})
